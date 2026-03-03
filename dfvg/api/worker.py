"""
DFVG Job Manager – Thread-safe background processing engine.

Manages processing jobs lifecycle: creation, execution, progress tracking, and completion.
Uses a singleton pattern for process-wide state and ThreadPoolExecutor for throttled execution.
"""

import logging
import shutil
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor, Future
from pathlib import Path
from typing import Dict, Optional

from ..config import Config
from ..detect import Detector
from ..image_processor import process_photos, DIR_PHOTOS
from ..manifest import RunManifest, compute_sha256
from ..pack import Packager
from ..report import generate_report
from ..rules import RulesEngine
from ..scene_detect import analyze_clip
from ..srt_parser import parse_dji_srt, get_gps_summary, export_gpx
from ..thumbnails import extract_thumbnail, generate_contact_sheet, DIR_THUMBNAILS
from ..transcode import Transcoder
from .models import JobResponse, JobStatus

logger = logging.getLogger("dfvg.api.worker")


class Job:
    """Internal mutable state for a single processing job."""

    __slots__ = (
        "job_id", "input_path", "mode", "status",
        "progress", "current_file", "message", "error", "output_dir",
        "future", "manifest_path",
    )

    def __init__(self, job_id: str, input_path: Path, mode: str):
        self.job_id = job_id
        self.input_path = input_path
        self.mode = mode
        self.status = JobStatus.PENDING
        self.progress: float = 0.0
        self.current_file: Optional[str] = None
        self.message: str = "Queued"
        self.error: Optional[str] = None
        self.output_dir: Optional[Path] = None
        self.future: Optional[Future] = None
        self.manifest_path: Optional[str] = None


class JobManager:
    """
    Singleton job manager with concurrent execution limits.

    Thread-safe: all public methods acquire ``_lock`` before accessing ``_jobs``.
    """

    _instance: Optional["JobManager"] = None

    def __new__(cls) -> "JobManager":
        if cls._instance is None:
            inst = super().__new__(cls)
            inst._jobs: Dict[str, Job] = {}
            inst._lock = threading.Lock()
            # Limit concurrency to avoid system freeze. 
            # CPU count - 1 is good, but for heavy transcoding, 2 or 3 is usually safer max.
            # Let's cap at 2 for stability given it's a desktop app.
            inst._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="dfvg-worker")
            cls._instance = inst
        return cls._instance

    # ── Public API ─────────────────────────────────────────────────

    def create_job(self, input_path: str, mode: str) -> str:
        job_id = str(uuid.uuid4())
        job = Job(job_id, Path(input_path).resolve(), mode)

        with self._lock:
            self._jobs[job_id] = job
        
        # Submit to executor
        future = self._executor.submit(self._process_job, job_id)
        job.future = future
        
        logger.info("Queued job %s for %s (mode=%s)", job_id[:8], input_path, mode)
        return job_id

    def get_job(self, job_id: str) -> Optional[JobResponse]:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
            return JobResponse(
                job_id=job.job_id,
                status=job.status,
                progress=job.progress,
                current_file=job.current_file,
                message=job.message if job.status != JobStatus.FAILED else (job.error or job.message),
                output_dir=str(job.output_dir) if job.output_dir else None,
                manifest_path=job.manifest_path,
            )
            
    def shutdown(self):
        """Gracefully shutdown executor."""
        logger.info("Shutting down JobManager...")
        self._executor.shutdown(wait=False, cancel_futures=True)

    # ── Internal Processing Pipeline ───────────────────────────────

    def _update(self, job: Job, **kwargs) -> None:
        """Thread-safe attribute update on a Job."""
        with self._lock:
            for k, v in kwargs.items():
                setattr(job, k, v)

    def _process_job(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return

        self._update(job, status=JobStatus.PROCESSING, message="Initializing…")
        logger.info("Starting execution of job %s", job_id[:8])

        manifest = None

        try:
            config = Config(processing_mode=job.mode)
            input_dir = job.input_path
            job.output_dir = input_dir

            originals_dir = input_dir / config.DIR_ORIGINALS
            originals_dir.mkdir(parents=True, exist_ok=True)

            # Create manifest
            manifest = RunManifest.create(input_dir, mode=job.mode)
            job.manifest_path = str(manifest.manifest_path)

            detector = Detector()
            rules_engine = RulesEngine(config)
            transcoder = Transcoder(config)
            packager = Packager(config)
            processed = []

            # ── Collect candidates (recursive) ─────────────────────
            valid_ext = {".mp4", ".mov", ".mkv", ".mxf"}
            ignore_dirs = {
                config.DIR_ORIGINALS, config.DIR_PROXIES,
                config.DIR_MASTERS, config.DIR_EXPORTS, config.DIR_LOGS,
                config.DIR_AUDIO, config.DIR_NO_AUDIO, DIR_THUMBNAILS, DIR_PHOTOS,
            }

            raw_files = []
            raw_files = self._collect_files(input_dir, valid_ext, ignore_dirs)
            if not raw_files and originals_dir.exists():
                raw_files = self._collect_files(originals_dir, valid_ext, set())

            if not raw_files:
                self._update(job, status=JobStatus.FAILED, message="No video files found")
                if manifest:
                    manifest.mark_run_failed("No video files found")
                return

            total = len(raw_files)

            # Register all files in manifest
            for fp, _ in raw_files:
                manifest.add_file(fp, compute_hash=True)

            # ── Process each file ──────────────────────────────────
            for idx, (fp, source_rel_parent) in enumerate(raw_files):
                base_progress = (idx / total) * 0.9

                rel_parent = source_rel_parent
                display_name = str(rel_parent / fp.name) if rel_parent != Path() else fp.name
                self._update(job, current_file=display_name, progress=base_progress,
                             message=f"Processing {display_name} ({idx + 1}/{total})")

                manifest.mark_processing(idx)

                # Archive (preserve nested structure inside 01_ORIGINALS)
                archive_dir = originals_dir / rel_parent
                archive_dir.mkdir(parents=True, exist_ok=True)
                if fp.parent != archive_dir:
                    dest = archive_dir / fp.name
                    if not dest.exists():
                        shutil.copy2(fp, dest)
                    fp = dest
                
                # Probe after archiving
                try:
                    meta = detector.probe(fp)
                except Exception as e:
                    logger.error("Detection failed for %s: %s", display_name, e)
                    manifest.mark_failed(idx, str(e))
                    continue

                processed.append(meta)

                # Thumbnail + Analysis
                try:
                    extract_thumbnail(fp, input_dir)
                    generate_contact_sheet(fp, input_dir, meta.duration)
                except Exception:
                    pass  # non-fatal

                # SRT / GPS
                srt_path = fp.with_suffix(".SRT")
                if not srt_path.exists():
                    srt_path = fp.with_suffix(".srt")
                if srt_path.exists():
                    try:
                        srt_frames = parse_dji_srt(srt_path)
                        gps = get_gps_summary(srt_frames)
                        if gps:
                            meta.gps_summary = {
                                "start_lat": gps.start_lat, "start_lon": gps.start_lon,
                                "end_lat": gps.end_lat, "end_lon": gps.end_lon,
                                "total_distance_m": gps.total_distance_m,
                                "max_alt": gps.max_alt, "avg_speed_kmh": gps.avg_speed_kmh,
                            }
                            export_gpx(srt_frames, input_dir / DIR_THUMBNAILS / f"{fp.stem}.gpx")
                    except Exception:
                        pass

                # Scene analysis
                try:
                    clip_analysis = analyze_clip(fp, duration=meta.duration)
                    meta.scene_count = clip_analysis.scene_count
                    meta.motion_score = clip_analysis.motion_score
                    meta.avg_brightness = clip_analysis.avg_brightness
                    meta.tags = clip_analysis.tags
                except Exception:
                    pass

                rule = rules_engine.evaluate(meta)

                def _progress(pct: float, _base=base_progress, _slot=1.0 / total * 0.9):
                    self._update(job, progress=_base + pct * _slot)

                try:
                    transcoder.transcode(meta, rule, input_dir, progress_callback=_progress, rel_path=rel_parent)

                    # Register outputs with checksums
                    self._register_outputs(manifest, idx, input_dir, config, meta, rel_parent)
                    manifest.mark_completed(idx)
                    logger.info("Job %s: finished %s", job_id[:8], display_name)
                except Exception as e:
                    logger.error("Transcoding failed for %s: %s", display_name, e)
                    manifest.mark_failed(idx, str(e))

            # ── Pack ───────────────────────────────────────────────
            self._update(job, message="Creating Editor Pack…", progress=0.95, current_file=None)

            if processed:
                packager.create_metadata_csv(processed, input_dir)
                packager.create_editor_pack(input_dir)

                # Generate HTML report
                try:
                    clips_dicts = [m.model_dump(mode="json") for m in processed]
                    generate_report(
                        project_dir=input_dir,
                        manifest_data=manifest.data.model_dump(mode="json"),
                        clips_metadata=clips_dicts,
                    )
                except Exception as e:
                    logger.warning("Report generation failed: %s", e)

            # ── Photo processing ───────────────────────────────────
            self._update(job, message="Processing photos…", progress=0.97, current_file=None)
            try:
                photo_meta, photo_count = process_photos(input_dir, lut_path=config.LUT_PATH)
                if photo_count > 0:
                    logger.info("Job %s: processed %d photos", job_id[:8], photo_count)
            except Exception as e:
                logger.warning("Photo processing failed: %s", e)

            manifest.finalize()
            self._update(job, status=JobStatus.COMPLETED, progress=1.0,
                         message=f"Done — manifest: {manifest.run_id}")
            logger.info("Job %s completed (manifest: %s)", job_id[:8], manifest.run_id)

        except Exception as e:
            logger.exception("Job %s failed", job_id[:8])
            if manifest:
                manifest.mark_run_failed(str(e))
            self._update(job, status=JobStatus.FAILED, error=str(e),
                         message=f"Error: {e}")

    @staticmethod
    def _register_outputs(manifest: RunManifest, file_idx: int, project_dir: Path,
                          config: Config, meta, rel_parent: Path):
        """Find and hash all output files for a given source."""
        audio_dirs = [project_dir / config.DIR_AUDIO, project_dir / config.DIR_NO_AUDIO]
        output_subdirs = [config.DIR_PROXIES, config.DIR_MASTERS, config.DIR_EXPORTS]
        stem = Path(meta.filename).stem

        for audio_dir in audio_dirs:
            for subdir in output_subdirs:
                out_dir = audio_dir / subdir / rel_parent
                if not out_dir.exists():
                    continue
                for f in out_dir.iterdir():
                    if f.is_file() and f.stem.startswith(stem):
                        manifest.add_output(file_idx, f, project_dir)

    @staticmethod
    def _collect_files(directory: Path, extensions: set, ignore_dirs: set) -> list[tuple[Path, Path]]:
        """Recursively collect video files.

        Returns a list of ``(absolute_path, relative_parent)`` tuples where
        ``relative_parent`` is the path of the file's parent directory
        relative to *directory*.

        Example::

            directory/Day_1/Scene_A/clip.mp4
            → (Path('.../clip.mp4'), Path('Day_1/Scene_A'))
        """
        results: list[tuple[Path, Path]] = []

        def _walk(current: Path, rel: Path) -> None:
            for item in sorted(current.iterdir()):
                if item.is_dir():
                    if item.name in ignore_dirs or item.name.startswith("."):
                        continue
                    _walk(item, rel / item.name)
                elif item.is_file() and item.suffix.lower() in extensions and not item.name.startswith("."):
                    results.append((item, rel))

        _walk(directory, Path())
        return results
