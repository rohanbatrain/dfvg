"""
DFVG Headless Background Daemon

Provides a true zero-touch pipeline. Runs in the background, watches for DJI SD cards
to be plugged in, and automatically orchestrates Ingestion, Processing, Verification,
Cleanup, and Cloud Uploading without a single click. Finally, safely ejects the drive.
"""

import json
import logging
import platform
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

from .drive_watcher import DriveWatcher

logger = logging.getLogger("dfvg.daemon")


class DFVGDaemon:
    def __init__(self, config_file: str = "dfvg_daemon.json"):
        self.config_path = Path(config_file).resolve()
        self.config = self._load_or_create_config()
        self.watcher = DriveWatcher(poll_interval=2.0)
        self.processed_drives = set()
        
        # Setting up logger specially for daemon
        log_dir = Path("logs")
        log_dir.mkdir(exist_ok=True)
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s [DAEMON] %(message)s",
            handlers=[
                logging.FileHandler(log_dir / "daemon.log"),
                logging.StreamHandler(sys.stdout)
            ]
        )

    def _load_or_create_config(self) -> dict:
        default_config = {
            "projects_root": str(Path.home() / "Movies" / "DFVG_Projects"),
            "cloud_sync_folder": str(Path.home() / "Documents" / "DFVG_Cloud"),
            "auto_eject": True
        }
        
        if not self.config_path.exists():
            with open(self.config_path, "w", encoding="utf-8") as f:
                json.dump(default_config, f, indent=4)
            return default_config
            
        try:
            with open(self.config_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return default_config

    def _run_cli(self, *args) -> bool:
        """Run a dfvg CLI command via subprocess for perfect memory isolation."""
        # Using sys.executable to run the dfvg module
        # If compiled to exe, sys.executable is the exe itself
        cmd = [sys.executable, "-m", "dfvg"] + list(args)
        
        # Determine if we are running as a frozen pyinstaller bundle
        if getattr(sys, 'frozen', False):
            cmd = [sys.executable] + list(args)
            
        try:
            logger.info("Running: %s", " ".join(cmd))
            result = subprocess.run(cmd, check=True, capture_output=True, text=True)
            logger.debug(result.stdout)
            return True
        except subprocess.CalledProcessError as e:
            logger.error("CLI Command failed: %s\n%s", " ".join(cmd), e.stderr)
            return False

    def _eject_drive(self, drive_path: str):
        """Cross-platform drive ejection."""
        logger.info("Ejecting drive: %s", drive_path)
        system = platform.system()
        try:
            if system == "Darwin":
                subprocess.run(["diskutil", "unmountDisk", "force", drive_path], check=True)
            elif system == "Windows":
                ps_script = f"(New-Object -comObject Shell.Application).Namespace(17).ParseName('{drive_path}').InvokeVerb('Eject')"
                subprocess.run(["powershell", "-Command", ps_script])
            elif system == "Linux":
                subprocess.run(["udisksctl", "unmount", "-b", drive_path], check=True)
        except Exception as e:
            logger.error("Failed to eject drive: %s", e)

    def process_drive(self, drive_path: str, label: str):
        """The Master Orchestration Pipeline for a single drive."""
        date_str = datetime.now().strftime("%Y-%m-%d")
        safe_label = "".join(c for c in label if c.isalnum() or c in (" ", "-", "_")).strip().replace(" ", "_")
        project_name = f"{date_str}_{safe_label}"
        
        projects_root = Path(self.config["projects_root"])
        cloud_root = Path(self.config["cloud_sync_folder"])
        projects_root.mkdir(parents=True, exist_ok=True)
        cloud_root.mkdir(parents=True, exist_ok=True)
        
        project_dir = projects_root / project_name
        logger.info("🚀 Starting Zero-Touch Pipeline for %s -> %s", drive_path, project_dir)
        
        # 1. Ingest
        logger.info("[1/4] Ingesting Media...")
        if not self._run_cli("ingest", drive_path, str(project_dir)):
            return False
            
        # 2. Process
        logger.info("[2/4] Processing Full Quality Modes...")
        if not self._run_cli("process", str(project_dir), "--mode", "FULL"):
            return False
            
        # 3. Verify
        logger.info("[3/4] Verifying Mathematical Accuracy...")
        if not self._run_cli("verify", str(project_dir)):
            return False
            
        # 4. Cleanup (Frees local original space if ingested via copy)
        # Note: Ingest copies from SD, so cleanup deletes local project copies, not SD card files.
        logger.info("[4/4] Safe Cleanup of Copied Originals...")
        self._run_cli("cleanup", str(project_dir), "--force")
        
        # 5. Move to Cloud
        logger.info("☁️ Moving output folders to Cloud Directory...")
        for folder in ["02_PROXIES", "03_GRADED_MASTERS", "05_PHOTOS"]:
            src = project_dir / folder
            dst = cloud_root / project_name / folder
            if src.exists() and any(src.iterdir()):
                dst.parent.mkdir(parents=True, exist_ok=True)
                try:
                    shutil.move(str(src), str(dst))
                    logger.info("Moved %s -> %s", folder, dst)
                except Exception as e:
                    logger.error("Failed to move %s: %s", folder, e)
                    
        # 6. Eject Drive
        if self.config.get("auto_eject", True):
            self._eject_drive(drive_path)
            
        logger.info("✅ Pipeline Complete for %s!", label)
        self.processed_drives.add(drive_path)
        return True

    def run(self):
        """Start the infinite polling loop."""
        logger.info("Starting DFVG Zero-Touch Daemon...")
        logger.info("Config Loaded: %s", self.config_path)
        logger.info("Watching for DJI SD Cards...")
        
        self.watcher.start()
        
        try:
            while True:
                drives = self.watcher.get_detected_drives()
                for path, drive_info in drives.items():
                    if path not in self.processed_drives:
                        logger.info("New drive detected: %s (Label: %s)", path, drive_info.label)
                        self.process_drive(path, drive_info.label)
                time.sleep(5)
        except KeyboardInterrupt:
            logger.info("Daemon shutting down gracefully...")
            self.watcher.stop()
            self.watcher.join()

if __name__ == "__main__":
    daemon = DFVGDaemon()
    daemon.run()
