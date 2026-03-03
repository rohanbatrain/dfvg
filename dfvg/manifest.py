"""
DFVG Run Manifest – CI-grade tracking with SHA-256 integrity verification.

Every processing run produces a manifest JSON that tracks:
- Per-file status and checksums (source + all outputs)
- Run-level state machine with interruption recovery
- Verified safe-cleanup gating
"""

import hashlib
import json
import logging
import os
import signal
import uuid
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger("dfvg.manifest")

# ── SHA-256 Hashing ────────────────────────────────────────────────

HASH_CHUNK_SIZE = 8 * 1024 * 1024  # 8 MB chunks for large files


def compute_sha256(file_path: Path) -> str:
    """Compute SHA-256 hex digest of a file using streaming reads."""
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        while True:
            chunk = f.read(HASH_CHUNK_SIZE)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


# ── Data Models ────────────────────────────────────────────────────

class FileStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


class RunStatus(str, Enum):
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    INTERRUPTED = "INTERRUPTED"
    FAILED = "FAILED"


class OutputEntry(BaseModel):
    """A single output file produced from a source."""
    path: str                       # relative path from project root
    sha256: Optional[str] = None
    verified: bool = False
    size_bytes: int = 0


class FileEntry(BaseModel):
    """Tracks one source file through the pipeline."""
    source: str                     # absolute path to original source
    filename: str
    source_sha256: Optional[str] = None
    source_size_bytes: int = 0
    status: FileStatus = FileStatus.PENDING
    error: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    outputs: List[OutputEntry] = Field(default_factory=list)


class RunSummary(BaseModel):
    total: int = 0
    completed: int = 0
    failed: int = 0
    skipped: int = 0
    interrupted: int = 0


class ManifestData(BaseModel):
    """The full manifest, serialized to JSON."""
    run_id: str
    status: RunStatus = RunStatus.RUNNING
    mode: str = "FULL"
    started_at: str
    completed_at: Optional[str] = None
    project_dir: str
    last_completed_index: int = -1     # for resume
    files: List[FileEntry] = Field(default_factory=list)
    summary: RunSummary = Field(default_factory=RunSummary)


# ── Run Manifest Manager ──────────────────────────────────────────

class RunManifest:
    """
    Creates, updates, and persists a run manifest.

    Usage::

        manifest = RunManifest.create(project_dir, mode="FULL")
        manifest.add_file(source_path)
        manifest.mark_processing(0)
        manifest.add_output(0, output_path)
        manifest.mark_completed(0)
        manifest.finalize()

    On interruption::

        manifest.mark_interrupted()  # saves immediately

    Resume::

        manifest = RunManifest.load_latest(project_dir)
        resume_from = manifest.get_resume_index()
    """

    def __init__(self, data: ManifestData, manifest_path: Path):
        self.data = data
        self.manifest_path = manifest_path
        self._interrupted = False

    # ── Factory methods ───────────────────────────────────────────

    @classmethod
    def create(cls, project_dir: Path, mode: str = "FULL") -> "RunManifest":
        """Create a new manifest for a fresh run."""
        now = datetime.now()
        run_id = f"{now.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:4]}"
        logs_dir = project_dir / "LOGS"
        logs_dir.mkdir(parents=True, exist_ok=True)
        manifest_path = logs_dir / f"manifest_{run_id}.json"

        data = ManifestData(
            run_id=run_id,
            mode=mode,
            started_at=now.isoformat(),
            project_dir=str(project_dir),
        )

        manifest = cls(data, manifest_path)
        manifest.save()
        logger.info("Created manifest %s", run_id)
        return manifest

    @classmethod
    def load(cls, manifest_path: Path) -> "RunManifest":
        """Load an existing manifest from disk."""
        with open(manifest_path) as f:
            raw = json.load(f)
        data = ManifestData(**raw)
        return cls(data, manifest_path)

    @classmethod
    def load_latest(cls, project_dir: Path) -> Optional["RunManifest"]:
        """Load the most recent manifest from a project's LOGS/."""
        logs_dir = project_dir / "LOGS"
        if not logs_dir.exists():
            return None
        manifests = sorted(logs_dir.glob("manifest_*.json"), reverse=True)
        if not manifests:
            return None
        return cls.load(manifests[0])

    @classmethod
    def list_runs(cls, project_dir: Path) -> List[Dict[str, Any]]:
        """List all manifests as summary dicts."""
        logs_dir = project_dir / "LOGS"
        if not logs_dir.exists():
            return []
        results = []
        for mf in sorted(logs_dir.glob("manifest_*.json"), reverse=True):
            try:
                with open(mf) as f:
                    raw = json.load(f)
                results.append({
                    "run_id": raw.get("run_id"),
                    "status": raw.get("status"),
                    "mode": raw.get("mode"),
                    "started_at": raw.get("started_at"),
                    "completed_at": raw.get("completed_at"),
                    "total": raw.get("summary", {}).get("total", 0),
                    "completed": raw.get("summary", {}).get("completed", 0),
                    "failed": raw.get("summary", {}).get("failed", 0),
                    "manifest_path": str(mf),
                })
            except Exception as e:
                logger.warning("Skipping corrupt manifest %s: %s", mf.name, e)
        return results

    # ── File Tracking ─────────────────────────────────────────────

    def add_file(self, source_path: Path, compute_hash: bool = True) -> int:
        """Register a source file. Returns its index."""
        entry = FileEntry(
            source=str(source_path),
            filename=source_path.name,
            source_size_bytes=source_path.stat().st_size if source_path.exists() else 0,
        )
        if compute_hash and source_path.exists():
            entry.source_sha256 = compute_sha256(source_path)
        self.data.files.append(entry)
        self.data.summary.total = len(self.data.files)
        return len(self.data.files) - 1

    def mark_processing(self, index: int) -> None:
        """Mark file as currently being processed."""
        entry = self.data.files[index]
        entry.status = FileStatus.PROCESSING
        entry.started_at = datetime.now().isoformat()
        self.save()

    def add_output(self, index: int, output_path: Path, project_dir: Path) -> None:
        """Register an output file with its checksum."""
        if not output_path.exists():
            return
        rel = str(output_path.relative_to(project_dir))
        sha = compute_sha256(output_path)
        size = output_path.stat().st_size
        self.data.files[index].outputs.append(OutputEntry(
            path=rel,
            sha256=sha,
            verified=True,  # just computed
            size_bytes=size,
        ))

    def mark_completed(self, index: int) -> None:
        """Mark file as successfully processed."""
        entry = self.data.files[index]
        entry.status = FileStatus.COMPLETED
        entry.completed_at = datetime.now().isoformat()
        self.data.last_completed_index = index
        self.data.summary.completed += 1
        self.save()

    def mark_failed(self, index: int, error: str) -> None:
        """Mark file as failed."""
        entry = self.data.files[index]
        entry.status = FileStatus.FAILED
        entry.error = error
        entry.completed_at = datetime.now().isoformat()
        self.data.summary.failed += 1
        self.save()

    def mark_skipped(self, index: int, reason: str = "skipped") -> None:
        """Mark file as skipped."""
        entry = self.data.files[index]
        entry.status = FileStatus.SKIPPED
        entry.error = reason
        self.data.summary.skipped += 1

    # ── Run-Level State ───────────────────────────────────────────

    def mark_interrupted(self) -> None:
        """Called on SIGINT/SIGTERM — saves state immediately."""
        self._interrupted = True
        self.data.status = RunStatus.INTERRUPTED
        self.data.completed_at = datetime.now().isoformat()
        # Mark any PROCESSING files as interrupted
        for entry in self.data.files:
            if entry.status == FileStatus.PROCESSING:
                entry.status = FileStatus.PENDING  # revert to pending for resume
                entry.error = "interrupted"
                self.data.summary.interrupted += 1
        self.save()
        logger.warning("Run %s interrupted — manifest saved", self.data.run_id)

    def mark_run_failed(self, error: str) -> None:
        """Mark the entire run as failed."""
        self.data.status = RunStatus.FAILED
        self.data.completed_at = datetime.now().isoformat()
        self.save()

    def finalize(self) -> None:
        """Mark the run as completed (called after all files processed)."""
        if self._interrupted:
            return  # already handled
        if self.data.summary.failed > 0:
            self.data.status = RunStatus.COMPLETED  # completed with errors
        else:
            self.data.status = RunStatus.COMPLETED
        self.data.completed_at = datetime.now().isoformat()
        self.save()
        logger.info("Run %s finalized: %s", self.data.run_id, self.data.status.value)

    # ── Resume ────────────────────────────────────────────────────

    def get_resume_index(self) -> int:
        """
        Return the index to resume from.
        
        Finds the first file that is not COMPLETED or SKIPPED.
        """
        for i, entry in enumerate(self.data.files):
            if entry.status not in (FileStatus.COMPLETED, FileStatus.SKIPPED):
                return i
        return len(self.data.files)  # nothing to resume

    @property
    def is_resumable(self) -> bool:
        return self.data.status == RunStatus.INTERRUPTED

    # ── Verification ──────────────────────────────────────────────

    def verify_outputs(self, project_dir: Path) -> Dict[str, Any]:
        """
        Re-hash every output file and compare to stored checksums.

        Returns a report dict with pass/fail counts and any mismatches.
        """
        total = 0
        passed = 0
        failed = 0
        missing = 0
        mismatches: List[Dict[str, str]] = []

        for entry in self.data.files:
            if entry.status != FileStatus.COMPLETED:
                continue
            for out in entry.outputs:
                total += 1
                out_path = project_dir / out.path
                if not out_path.exists():
                    missing += 1
                    failed += 1
                    out.verified = False
                    mismatches.append({
                        "file": out.path,
                        "error": "MISSING",
                    })
                    continue

                actual_sha = compute_sha256(out_path)
                if actual_sha == out.sha256:
                    passed += 1
                    out.verified = True
                else:
                    failed += 1
                    out.verified = False
                    mismatches.append({
                        "file": out.path,
                        "expected": out.sha256,
                        "actual": actual_sha,
                        "error": "CHECKSUM_MISMATCH",
                    })

        self.save()
        return {
            "total_outputs": total,
            "passed": passed,
            "failed": failed,
            "missing": missing,
            "mismatches": mismatches,
            "all_verified": failed == 0 and total > 0,
        }

    def is_safe_to_clean(self, project_dir: Path) -> tuple[bool, str]:
        """
        Check if it's safe to delete source files.

        Returns ``(safe, reason)`` — safe is True only if:
        1. Run status is COMPLETED
        2. All output checksums have been verified
        """
        if self.data.status != RunStatus.COMPLETED:
            return False, f"Run not completed (status={self.data.status.value})"

        if self.data.summary.failed > 0:
            return False, f"{self.data.summary.failed} files failed processing"

        # Check all outputs are verified
        unverified = 0
        for entry in self.data.files:
            if entry.status != FileStatus.COMPLETED:
                continue
            for out in entry.outputs:
                if not out.verified:
                    unverified += 1

        if unverified > 0:
            return False, f"{unverified} output files not verified — run 'dfvg verify' first"

        return True, "All outputs verified"

    # ── Signal Handling ───────────────────────────────────────────

    def install_signal_handlers(self) -> None:
        """Install SIGINT/SIGTERM handlers that save manifest before exit."""
        def _handler(signum, frame):
            sig_name = signal.Signals(signum).name
            logger.warning("Received %s — saving manifest…", sig_name)
            self.mark_interrupted()
            raise KeyboardInterrupt  # re-raise for normal flow

        signal.signal(signal.SIGINT, _handler)
        signal.signal(signal.SIGTERM, _handler)

    # ── Persistence ───────────────────────────────────────────────

    def save(self) -> None:
        """Atomically write manifest to disk (write-then-rename)."""
        tmp_path = self.manifest_path.with_suffix(".tmp")
        with open(tmp_path, "w") as f:
            json.dump(self.data.model_dump(mode="json"), f, indent=2, default=str)
        tmp_path.replace(self.manifest_path)

    @property
    def run_id(self) -> str:
        return self.data.run_id
