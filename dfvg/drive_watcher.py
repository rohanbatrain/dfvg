"""
DFVG Drive Watcher – Cross-platform external drive auto-detection.

Polls for newly mounted external drives, validates them as DJI SD cards,
and exposes detected drives via a thread-safe API.  Never copies or
modifies any files — detection only.
"""

import logging
import platform
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set

from pydantic import BaseModel

from .ingest import Ingester

logger = logging.getLogger("dfvg.drive_watcher")


class DetectedDrive(BaseModel):
    """A validated DJI drive that the user hasn't dismissed yet."""
    path: str
    label: str                    # volume name / last path component
    is_dji: bool                  # True if validated as DJI card
    detected_at: str              # ISO timestamp
    video_count: int = 0          # number of MP4s found in DCIM
    total_bytes: int = 0          # total storage capacity
    used_bytes: int = 0           # used storage


class DriveWatcher:
    """
    Background daemon that detects new external drives.

    Platform support:
    - macOS:   polls ``/Volumes/``
    - Windows: polls Win32 logical drives via ``ctypes``
    - Linux:   polls ``/media/$USER/`` and ``/run/media/$USER/``

    Thread-safe: all public methods acquire ``_lock``.
    """

    def __init__(self, poll_interval: float = 2.0):
        self.poll_interval = poll_interval
        self._lock = threading.Lock()
        self._detected: Dict[str, DetectedDrive] = {}  # path -> info
        self._dismissed: Set[str] = set()               # paths user said "no" to
        self._known: Set[str] = set()                   # paths already seen this session
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._system = platform.system()

    # ── Public API ────────────────────────────────────────────────

    def start(self) -> None:
        """Start the background polling thread."""
        if self._running:
            return
        # Snapshot currently mounted volumes so we don't alert on boot
        self._known = self._list_volumes()
        self._running = True
        self._thread = threading.Thread(
            target=self._poll_loop, daemon=True, name="dfvg-drive-watcher"
        )
        self._thread.start()
        logger.info("DriveWatcher started (platform=%s, interval=%.1fs)", self._system, self.poll_interval)

    def stop(self) -> None:
        """Stop the background thread."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
        logger.info("DriveWatcher stopped")

    def get_detected_drives(self) -> List[DetectedDrive]:
        """Return currently detected (not dismissed) DJI drives."""
        with self._lock:
            return list(self._detected.values())

    def dismiss_drive(self, path: str) -> bool:
        """
        Dismiss a drive (user declined ingestion).
        Returns True if the drive was found and dismissed.
        """
        with self._lock:
            self._dismissed.add(path)
            removed = path in self._detected
            self._detected.pop(path, None)
            return removed

    # ── Polling Loop ──────────────────────────────────────────────

    def _poll_loop(self) -> None:
        while self._running:
            try:
                current = self._list_volumes()
                new_volumes = current - self._known

                for vol_path in new_volumes:
                    self._known.add(vol_path)
                    if vol_path in self._dismissed:
                        continue

                    vol = Path(vol_path)
                    if not vol.is_dir():
                        continue

                    is_dji = Ingester.validate_dji_source(vol)
                    video_count = 0

                    if is_dji:
                        # Count MP4s for the summary
                        dcim = vol / "DCIM"
                        if dcim.is_dir():
                            for media_dir in dcim.iterdir():
                                if media_dir.is_dir() and media_dir.name.upper().endswith("MEDIA"):
                                    video_count += len(
                                        [f for f in media_dir.iterdir()
                                         if f.is_file() and f.suffix.lower() in {".mp4", ".mov"}]
                                    )

                        # Get storage info
                        try:
                            import shutil
                            usage = shutil.disk_usage(vol_path)
                            total_bytes = usage.total
                            used_bytes = usage.used
                        except Exception:
                            total_bytes = 0
                            used_bytes = 0

                        drive = DetectedDrive(
                            path=vol_path,
                            label=vol.name,
                            is_dji=True,
                            detected_at=datetime.now().isoformat(),
                            video_count=video_count,
                            total_bytes=total_bytes,
                            used_bytes=used_bytes,
                        )

                        with self._lock:
                            self._detected[vol_path] = drive

                        logger.info(
                            "Detected DJI drive: %s (%d videos)", vol_path, video_count
                        )

                # Also clean up drives that were unmounted
                removed = self._known - current
                if removed:
                    with self._lock:
                        for r in removed:
                            self._detected.pop(r, None)
                    self._known -= removed

            except Exception as e:
                logger.error("DriveWatcher poll error: %s", e)

            time.sleep(self.poll_interval)

    # ── Platform-Specific Volume Listing ──────────────────────────

    def _list_volumes(self) -> Set[str]:
        """Return a set of currently mounted external volume paths."""
        if self._system == "Darwin":
            return self._list_volumes_macos()
        elif self._system == "Windows":
            return self._list_volumes_windows()
        else:
            return self._list_volumes_linux()

    @staticmethod
    def _list_volumes_macos() -> Set[str]:
        """List volumes under /Volumes/, excluding the system volume."""
        volumes_dir = Path("/Volumes")
        if not volumes_dir.exists():
            return set()
        return {
            str(v) for v in volumes_dir.iterdir()
            if v.is_dir() and v.name != "Macintosh HD"
        }

    @staticmethod
    def _list_volumes_windows() -> Set[str]:
        """List logical drives on Windows using ctypes."""
        try:
            import ctypes
            bitmask = ctypes.windll.kernel32.GetLogicalDrives()  # type: ignore[attr-defined]
            drives: Set[str] = set()
            for letter in range(26):
                if bitmask & (1 << letter):
                    drive = f"{chr(65 + letter)}:\\"
                    # Skip C:\ (usually system)
                    if drive != "C:\\":
                        drives.add(drive)
            return drives
        except Exception:
            return set()

    @staticmethod
    def _list_volumes_linux() -> Set[str]:
        """List volumes under /media/$USER/ and /run/media/$USER/."""
        import os
        user = os.environ.get("USER", "")
        roots = [Path(f"/media/{user}"), Path(f"/run/media/{user}")]
        volumes: Set[str] = set()
        for root in roots:
            if root.is_dir():
                for v in root.iterdir():
                    if v.is_dir():
                        volumes.add(str(v))
        return volumes
