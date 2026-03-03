"""
DFVG Ingester – DJI-aware footage ingestion with lossless preservation.

Validates DJI SD card structure (DCIM/*MEDIA/), collects video files with
their sidecar companions (.LRF, .WAV, .DNG, .JPG), groups split recordings,
and copies everything into a project's 01_ORIGINALS with duplicate detection.
"""

import logging
import re
import shutil
from pathlib import Path
from typing import Dict, List, Optional, Set

from pydantic import BaseModel

from .config import Config
from .detect import Detector, ClipMetadata

logger = logging.getLogger("dfvg.ingest")

# Primary video extensions we transcode
VIDEO_EXTENSIONS: Set[str] = {".mp4", ".mov", ".mkv", ".mxf"}

# Image extensions — treated as primary media when no matching video exists
IMAGE_EXTENSIONS: Set[str] = {".jpg", ".jpeg", ".dng"}

# Sidecar extensions we preserve alongside videos (images become sidecars when paired with video)
SIDECAR_EXTENSIONS: Set[str] = {".lrf", ".wav", ".dng", ".jpg", ".jpeg", ".srt", ".ass"}

# All media extensions (video + image + sidecar)
ALL_MEDIA_EXTENSIONS: Set[str] = VIDEO_EXTENSIONS | SIDECAR_EXTENSIONS

# DJI split-file naming: DJI_XXXX.MP4, DJI_XXXX_01.MP4, DJI_XXXX_02.MP4
_DJI_SPLIT_RE = re.compile(
    r"^(?P<base>DJI_\d{4})(?:_(?P<seg>\d{2}))?\.(?P<ext>\w+)$",
    re.IGNORECASE,
)


class SidecarFile(BaseModel):
    """A companion file that travels with a video."""
    source: Path
    destination: Path
    extension: str


class IngestItem(BaseModel):
    """Describes one file's ingest plan."""
    source: Path
    destination: Path
    rel_display: str            # human-readable relative path inside ORIGINALS
    metadata: Optional[ClipMetadata] = None
    sidecars: List[SidecarFile] = []
    split_group: Optional[str] = None   # e.g. "DJI_0008" if part of a split recording
    skipped: bool = False
    skip_reason: Optional[str] = None


class IngestSummary(BaseModel):
    """Result of an ingest scan or execution."""
    total_found: int
    to_copy: int
    skipped: int
    sidecar_count: int
    is_dji_source: bool
    items: List[IngestItem]


class DJIValidationError(ValueError):
    """Raised when a source directory does not look like a DJI SD card."""
    pass


class Ingester:
    """DJI-aware ingester that validates source structure before touching files."""

    def __init__(self, config: Config):
        self.config = config
        self.detector = Detector()

    # ── Public API ────────────────────────────────────────────────

    @staticmethod
    def validate_dji_source(source_dir: Path) -> bool:
        """
        Check whether *source_dir* looks like a DJI action camera SD card.

        Requires:
        - ``DCIM/`` directory exists
        - At least one ``*MEDIA/`` subfolder inside DCIM
        - At least one ``.MP4`` file inside a MEDIA folder
        """
        dcim = source_dir / "DCIM"
        if not dcim.is_dir():
            return False

        for child in dcim.iterdir():
            if child.is_dir() and child.name.upper().endswith("MEDIA"):
                # Check for at least one MP4
                mp4s = list(child.glob("*.MP4")) + list(child.glob("*.mp4"))
                if mp4s:
                    return True

        return False

    def scan(self, source_dir: Path, project_dir: Path) -> IngestSummary:
        """
        Scan *source_dir* for video files and build an ingest plan.

        If the source contains a ``DCIM/`` folder it is treated as a DJI
        card: only ``DCIM/*MEDIA/`` is scanned and the structure is
        validated first.  Otherwise the entire directory is scanned as a
        generic source.
        """
        originals_dir = project_dir / self.config.DIR_ORIGINALS
        is_dji = self.validate_dji_source(source_dir)

        if is_dji:
            logger.info("DJI SD card structure detected at %s", source_dir)
            video_files, sidecar_map = self._collect_dji_files(source_dir)
        else:
            # Generic source — scan everything, still collect sidecars
            video_files, sidecar_map = self._collect_generic_files(source_dir)

        items: List[IngestItem] = []
        skipped = 0
        total_sidecars = 0

        for fp in video_files:
            try:
                meta = self.detector.probe(fp)
            except Exception as e:
                logger.warning("Skipping %s: probe failed (%s)", fp.name, e)
                continue

            date_folder = self._date_folder(meta)
            camera_folder = self._camera_folder(meta)
            dest_dir = Path(date_folder) / camera_folder

            rel = dest_dir / fp.name
            dest = originals_dir / rel

            # Split-file group detection
            split_group = self._detect_split_group(fp.name)

            # Collect sidecars for this video
            stem = fp.stem
            # Also check for the base stem (for split files: DJI_0008_01 → DJI_0008)
            stems_to_check = {stem}
            if split_group:
                stems_to_check.add(split_group)

            sidecars: List[SidecarFile] = []
            for check_stem in stems_to_check:
                for sc_path in sidecar_map.get(check_stem, []):
                    sc_dest = originals_dir / dest_dir / sc_path.name
                    sidecars.append(SidecarFile(
                        source=sc_path,
                        destination=sc_dest,
                        extension=sc_path.suffix.lower(),
                    ))
            total_sidecars += len(sidecars)

            item = IngestItem(
                source=fp,
                destination=dest,
                rel_display=str(rel),
                metadata=meta,
                sidecars=sidecars,
                split_group=split_group,
            )

            # Duplicate detection: same name + same size
            if dest.exists() and dest.stat().st_size == fp.stat().st_size:
                item.skipped = True
                item.skip_reason = "duplicate (same name & size)"
                skipped += 1

            items.append(item)

        return IngestSummary(
            total_found=len(items),
            to_copy=len(items) - skipped,
            skipped=skipped,
            sidecar_count=total_sidecars,
            is_dji_source=is_dji,
            items=items,
        )

    def execute(self, plan: IngestSummary, dry_run: bool = False) -> int:
        """
        Execute the ingest plan: copy video files + sidecars.

        Uses ``shutil.copy2`` for lossless metadata preservation
        (timestamps, permissions, extended attributes).

        Returns the number of **video** files copied.
        """
        copied = 0
        for item in plan.items:
            if item.skipped:
                logger.info("SKIP %s → %s (%s)", item.source.name, item.rel_display, item.skip_reason)
                continue

            logger.info("COPY %s → %s", item.source.name, item.rel_display)
            if not dry_run:
                item.destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(item.source, item.destination)

            # Copy sidecars
            for sc in item.sidecars:
                if sc.destination.exists() and sc.destination.stat().st_size == sc.source.stat().st_size:
                    logger.debug("SKIP sidecar %s (duplicate)", sc.source.name)
                    continue
                logger.info("  + sidecar %s", sc.source.name)
                if not dry_run:
                    sc.destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(sc.source, sc.destination)

            copied += 1

        return copied

    # ── DJI-Specific Scanning ─────────────────────────────────────

    def _collect_dji_files(self, source_dir: Path):
        """
        Scan only inside ``DCIM/*MEDIA/`` folders.

        Returns ``(video_files, sidecar_map)`` where sidecar_map is
        ``{stem: [Path, ...]}`` for quick lookup.
        """
        dcim = source_dir / "DCIM"
        video_files: List[Path] = []
        sidecar_map: Dict[str, List[Path]] = {}

        for media_dir in sorted(dcim.iterdir()):
            if not media_dir.is_dir() or not media_dir.name.upper().endswith("MEDIA"):
                continue

            for f in sorted(media_dir.iterdir()):
                if not f.is_file() or f.name.startswith("."):
                    continue

                ext = f.suffix.lower()
                if ext in VIDEO_EXTENSIONS:
                    video_files.append(f)
                elif ext in SIDECAR_EXTENSIONS:
                    # Index by stem (and also by base split stem)
                    stem = f.stem
                    sidecar_map.setdefault(stem, []).append(f)
                    # Also index under base split group
                    split = self._detect_split_group(f.name)
                    if split and split != stem:
                        sidecar_map.setdefault(split, []).append(f)

        return video_files, sidecar_map

    def _collect_generic_files(self, source_dir: Path):
        """
        Recursively collect video + sidecar files from a generic directory.
        """
        video_files: List[Path] = []
        sidecar_map: Dict[str, List[Path]] = {}

        def _walk(cur: Path) -> None:
            for item in sorted(cur.iterdir()):
                if item.is_dir() and not item.name.startswith("."):
                    _walk(item)
                elif item.is_file() and not item.name.startswith("."):
                    ext = item.suffix.lower()
                    if ext in VIDEO_EXTENSIONS:
                        video_files.append(item)
                    elif ext in SIDECAR_EXTENSIONS:
                        stem = item.stem
                        sidecar_map.setdefault(stem, []).append(item)
                        split = self._detect_split_group(item.name)
                        if split and split != stem:
                            sidecar_map.setdefault(split, []).append(item)

        if source_dir.exists():
            _walk(source_dir)
        return video_files, sidecar_map

    # ── Helpers ────────────────────────────────────────────────────

    @staticmethod
    def _date_folder(meta: ClipMetadata) -> str:
        """Extract YYYY-MM-DD from the creation_date, or fall back."""
        if meta.creation_date:
            date_part = meta.creation_date.split("T")[0]
            if re.match(r"\d{4}-\d{2}-\d{2}", date_part):
                return date_part
        return "Unknown_Date"

    @staticmethod
    def _camera_folder(meta: ClipMetadata) -> str:
        """
        Normalize camera_model into a filesystem-safe folder name.

        ``"DJI Action 5 Pro"`` → ``"Action_5_Pro"``
        ``None``               → ``"Unknown_Camera"``
        """
        if not meta.camera_model:
            return "Unknown_Camera"
        name = meta.camera_model.strip()
        for prefix in ("DJI ", "GoPro ", "Insta360 "):
            if name.startswith(prefix):
                name = name[len(prefix):]
                break
        name = re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_")
        return name or "Unknown_Camera"

    @staticmethod
    def _detect_split_group(filename: str) -> Optional[str]:
        """
        If *filename* matches DJI split naming, return the base group name.

        ``DJI_0008.MP4``    → ``"DJI_0008"``
        ``DJI_0008_01.MP4`` → ``"DJI_0008"``
        ``random.mp4``      → ``None``
        """
        m = _DJI_SPLIT_RE.match(filename)
        if m:
            return m.group("base")
        return None
