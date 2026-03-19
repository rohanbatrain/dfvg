"""
DFVG FastAPI Application – Production Configuration

Endpoints:
    GET  /health             System health check
    GET  /network-info       LAN IP and port for mobile pairing
    POST /scan?path=<dir>    Scan directory for video clips
    POST /jobs               Start a processing job
    GET  /jobs/{job_id}      Poll job status
    GET  /                   Serve frontend (if built)
"""

import logging
import os
import socket
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional
import asyncio
import base64
import queue

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .models import (
    CleanupRequest, CleanupResponse, ClipInfo, DetectedDriveInfo,
    ExtractFramesRequest, ExtractFramesResponse, ExtractedFrameInfo,
    IngestFileInfo, IngestPlanResponse, IngestRequest,
    JobRequest, JobResponse, RunInfo, ScanResponse, VerifyResponse,
)
from .worker import JobManager
from ..config import Config
from ..detect import Detector
from ..drive_watcher import DriveWatcher
from ..ingest import Ingester
from ..manifest import RunManifest
from ..thumbnails import DIR_THUMBNAILS

# ── Logging ────────────────────────────────────────────────────────
logger = logging.getLogger("dfvg.api")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

# ── Drive Watcher (singleton) ──────────────────────────────────────
_drive_watcher = DriveWatcher()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle for the FastAPI app."""
    _drive_watcher.start()
    logger.info("Drive watcher started")
    yield
    _drive_watcher.stop()
    logger.info("Drive watcher stopped")


# ── App ────────────────────────────────────────────────────────────
app = FastAPI(
    title="DFVG API",
    version="1.0.0",
    description="DJI Footage Variant Generator – REST API",
    docs_url="/docs" if __debug__ else None,
    redoc_url=None,
    lifespan=lifespan,
)

# ── CORS – open for LAN / mobile access ───────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def request_logging(request: Request, call_next):
    """Log every request with timing."""
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = (time.perf_counter() - start) * 1000
    logger.info(
        "%s %s → %d (%.1fms)",
        request.method, request.url.path, response.status_code, elapsed,
    )
    return response


# ── Global Exception Handler ──────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# ── Helpers ────────────────────────────────────────────────────────
def _get_local_ip() -> str:
    """Return the machine's LAN IP address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


# ── Health ─────────────────────────────────────────────────────────
@app.get("/health")
def health_check():
    return {"status": "ok", "version": app.version}


# ── Network Info (for mobile pairing) ─────────────────────────────
@app.get("/network-info")
def network_info(request: Request):
    """Return LAN IP and port so mobile apps can discover this server."""
    host = _get_local_ip()
    # Try to get the port from the request URL
    port = request.url.port or int(os.environ.get("DFVG_PORT", "8000"))
    return {
        "ip": host,
        "port": port,
        "url": f"http://{host}:{port}",
        "version": app.version,
    }


# ── Scan ───────────────────────────────────────────────────────────
VALID_EXTENSIONS = {".mp4", ".mov", ".mkv", ".mxf"}


@app.post("/scan", response_model=ScanResponse)
def scan_directory(path: str):
    """Scan a directory and return detected clip metadata."""
    input_path = Path(path).resolve()

    if not input_path.exists():
        raise HTTPException(status_code=400, detail=f"Path does not exist: {path}")
    if not input_path.is_dir():
        raise HTTPException(status_code=400, detail=f"Not a directory: {path}")

    config = Config()
    ignore_dirs = {
        config.DIR_ORIGINALS, config.DIR_PROXIES,
        config.DIR_MASTERS, config.DIR_EXPORTS, config.DIR_LOGS,
        config.DIR_AUDIO, config.DIR_NO_AUDIO,
    }

    candidates = _collect_video_files(input_path, ignore_dirs)

    # Fall back to originals dir
    if not candidates:
        originals = input_path / config.DIR_ORIGINALS
        if originals.exists():
            candidates = _collect_video_files(originals, ignore_dirs)

    detector = Detector()
    clips = []
    for fp in candidates:
        try:
            meta = detector.probe(fp)
            clips.append(ClipInfo(
                filename=meta.filename,
                width=meta.width, height=meta.height,
                fps=meta.fps, duration=meta.duration,
                video_codec=meta.video_codec, bit_depth=meta.bit_depth,
                camera_model=meta.camera_model,
                color_profile=meta.color_profile,
            ))
        except Exception as e:
            logger.warning("Skipping %s: %s", fp.name, e)

    logger.info("Scanned %s → %d clips", input_path, len(clips))
    return ScanResponse(path=str(input_path), clips=clips)


def _collect_video_files(directory: Path, ignore_dirs: set) -> list[Path]:
    """Collect video files from a directory, excluding ignored sub-dirs."""
    files = []
    for item in sorted(directory.iterdir()):
        if item.is_dir() and item.name in ignore_dirs:
            continue
        if item.is_file() and item.suffix.lower() in VALID_EXTENSIONS and not item.name.startswith("."):
            files.append(item)
    return files


# ── Ingest ─────────────────────────────────────────────────────────

@app.post("/ingest", response_model=IngestPlanResponse)
def ingest_scan(request: IngestRequest):
    """Scan a source directory and return an ingest plan (no files are copied)."""
    source = Path(request.source_path).resolve()
    project = Path(request.project_path).resolve()

    if not source.exists() or not source.is_dir():
        raise HTTPException(status_code=400, detail=f"Source path does not exist: {request.source_path}")

    # Ensure destination exists or can be created
    try:
        project.mkdir(parents=True, exist_ok=True)
    except PermissionError:
        raise HTTPException(status_code=400, detail="Cannot create project directory (Permission Denied).")
    
    # Check if writable
    try:
        test_file = project / ".dfvg_write_test"
        test_file.touch()
        test_file.unlink()
    except Exception:
        raise HTTPException(status_code=400, detail="Destination directory is strictly read-only.")

    config = Config(processing_mode=request.mode.value)
    ingester = Ingester(config)
    plan = ingester.scan(source, project)

    return IngestPlanResponse(
        total_found=plan.total_found,
        to_copy=plan.to_copy,
        skipped=plan.skipped,
        sidecar_count=plan.sidecar_count,
        is_dji_source=plan.is_dji_source,
        files=[
            IngestFileInfo(
                source=str(item.source),
                destination=item.rel_display,
                sidecar_count=len(item.sidecars),
                split_group=item.split_group,
                skipped=item.skipped,
                skip_reason=item.skip_reason,
            )
            for item in plan.items
        ],
    )


@app.post("/ingest/execute")
def ingest_execute(request: IngestRequest):
    """Execute ingestion: copy files to project. Optionally starts a processing job."""
    source = Path(request.source_path).resolve()
    project = Path(request.project_path).resolve()

    if not source.exists() or not source.is_dir():
        raise HTTPException(status_code=400, detail=f"Source path does not exist: {request.source_path}")

    # Ensure destination exists or can be created
    try:
        project.mkdir(parents=True, exist_ok=True)
    except PermissionError:
        raise HTTPException(status_code=400, detail="Cannot create project directory (Permission Denied).")
    
    # Check if writable
    try:
        test_file = project / ".dfvg_write_test"
        test_file.touch()
        test_file.unlink()
    except Exception:
        raise HTTPException(status_code=400, detail="Destination directory is strictly read-only.")

    config = Config(processing_mode=request.mode.value)
    ingester = Ingester(config)
    plan = ingester.scan(source, project)
    copied = ingester.execute(plan)

    result = {
        "copied": copied,
        "skipped": plan.skipped,
        "sidecars": plan.sidecar_count,
        "total": plan.total_found,
        "is_dji_source": plan.is_dji_source,
    }

    # Optionally kick off processing
    if request.process_after and copied > 0:
        manager = JobManager()
        job_id = manager.create_job(str(project), request.mode.value)
        result["job_id"] = job_id

    return result


# ── Drives ─────────────────────────────────────────────────────────

@app.get("/drives", response_model=list[DetectedDriveInfo])
def list_detected_drives():
    """Return currently detected external DJI drives."""
    drives = _drive_watcher.get_detected_drives()
    return [
        DetectedDriveInfo(
            path=d.path,
            label=d.label,
            is_dji=d.is_dji,
            detected_at=d.detected_at,
            video_count=d.video_count,
            total_bytes=d.total_bytes,
            used_bytes=d.used_bytes,
        )
        for d in drives
    ]


@app.post("/drives/dismiss")
def dismiss_drive(path: str):
    """Dismiss a detected drive (user declined ingestion)."""
    found = _drive_watcher.dismiss_drive(path)
    if not found:
        raise HTTPException(status_code=404, detail="Drive not found in detected list")
    return {"dismissed": True, "path": path}


@app.post("/drives/eject")
def eject_drive(path: str):
    """Safely eject an external drive (macOS: diskutil eject)."""
    import subprocess
    import platform

    drive_path = Path(path).resolve()
    if not drive_path.exists():
        raise HTTPException(status_code=404, detail="Drive path not found")

    if platform.system() == "Darwin":
        try:
            result = subprocess.run(
                ["diskutil", "eject", str(drive_path)],
                capture_output=True, text=True, timeout=15,
            )
            if result.returncode == 0:
                _drive_watcher.dismiss_drive(path)
                logger.info(f"Ejected drive: {path}")
                return {"ejected": True, "path": path, "message": result.stdout.strip()}
            else:
                raise HTTPException(status_code=500, detail=f"Eject failed: {result.stderr.strip()}")
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=500, detail="Eject timed out")
    else:
        raise HTTPException(status_code=501, detail="Eject only supported on macOS")


# ── Runs / Verify / Cleanup ───────────────────────────────────────

@app.get("/runs", response_model=list[RunInfo])
def list_runs(project_path: str):
    """List processing run history for a project."""
    project = Path(project_path).resolve()
    if not project.exists():
        raise HTTPException(status_code=400, detail="Project path does not exist")
    runs = RunManifest.list_runs(project)
    return [
        RunInfo(
            run_id=r["run_id"],
            status=r["status"],
            mode=r["mode"],
            started_at=r.get("started_at"),
            completed_at=r.get("completed_at"),
            total=r["total"],
            completed=r["completed"],
            failed=r["failed"],
            manifest_path=r.get("manifest_path"),
        )
        for r in runs
    ]


@app.post("/verify", response_model=VerifyResponse)
def verify_outputs(project_path: str):
    """Re-verify all output checksums for the latest run."""
    project = Path(project_path).resolve()
    manifest = RunManifest.load_latest(project)
    if not manifest:
        raise HTTPException(status_code=404, detail="No manifest found")

    report = manifest.verify_outputs(project)
    return VerifyResponse(
        run_id=manifest.run_id,
        total_outputs=report["total_outputs"],
        passed=report["passed"],
        failed=report["failed"],
        missing=report["missing"],
        all_verified=report["all_verified"],
        mismatches=report["mismatches"],
    )


@app.post("/cleanup", response_model=CleanupResponse)
def cleanup_sources(request: CleanupRequest):
    """Safely delete source files after verification."""
    project = Path(request.project_path).resolve()
    manifest = RunManifest.load_latest(project)
    if not manifest:
        raise HTTPException(status_code=404, detail="No manifest found")

    # Verify first
    report = manifest.verify_outputs(project)
    if not report["all_verified"]:
        return CleanupResponse(
            safe=False,
            reason=f"Verification failed: {report['failed']} outputs failed, {report['missing']} missing",
        )

    safe, reason = manifest.is_safe_to_clean(project)
    if not safe:
        return CleanupResponse(safe=False, reason=reason)

    # Delete sources
    originals_dir = project / "01_ORIGINALS"
    deleted = 0
    freed = 0
    if originals_dir.exists():
        for f in originals_dir.rglob("*"):
            if f.is_file():
                freed += f.stat().st_size
                f.unlink()
                deleted += 1
        # Remove empty dirs
        for d in sorted(originals_dir.rglob("*"), reverse=True):
            if d.is_dir() and not any(d.iterdir()):
                d.rmdir()

    return CleanupResponse(
        safe=True,
        reason="All outputs verified — sources cleaned",
        files_deleted=deleted,
        bytes_freed=freed,
    )


# ── Thumbnails ───────────────────────────────────────────────────

@app.get("/thumbnails/{project_path:path}/{filename}")
def get_thumbnail(project_path: str, filename: str):
    """Serve a thumbnail image for a clip."""
    project = Path(project_path).resolve()
    thumb = project / DIR_THUMBNAILS / filename
    if not thumb.exists():
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return FileResponse(thumb, media_type="image/jpeg")


# ── Real-time Preview (WebSocket) ───────────────────────────────

# Shared preview queue — worker pushes frames, WebSocket reads them
preview_queue: queue.Queue = queue.Queue(maxsize=5)


@app.websocket("/ws/preview")
async def ws_preview(ws: WebSocket):
    """Stream live transcode preview frames to connected clients."""
    await ws.accept()
    logger.info("Preview WebSocket connected")
    try:
        while True:
            try:
                frame_data = preview_queue.get_nowait()
                await ws.send_json(frame_data)
            except queue.Empty:
                pass
            await asyncio.sleep(1.0)  # poll every second
    except WebSocketDisconnect:
        logger.info("Preview WebSocket disconnected")
    except Exception as e:
        logger.warning("Preview WebSocket error: %s", e)


# ── Jobs ───────────────────────────────────────────────────────────
@app.post("/jobs", response_model=JobResponse)
def create_job(request: JobRequest):
    """Start a new processing job."""
    input_path = Path(request.input_path).resolve()
    if not input_path.exists() or not input_path.is_dir():
        raise HTTPException(status_code=400, detail="Invalid input path")

    manager = JobManager()
    job_id = manager.create_job(str(input_path), request.mode.value)

    job = manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=500, detail="Failed to create job")
    return job


@app.get("/jobs/{job_id}", response_model=JobResponse)
def get_job_status(job_id: str):
    """Poll job progress."""
    manager = JobManager()
    job = manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


# ── Frame Extraction ────────────────────────────────────────────────

VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".mxf"}

@app.post("/extract-frames", response_model=ExtractFramesResponse)
def extract_frames(request: ExtractFramesRequest):
    """Extract random high-quality frames from video files."""
    from ..frame_extractor import extract_random_frames

    source = Path(request.source_path).resolve()
    project = Path(request.project_path).resolve()

    if not source.exists():
        raise HTTPException(status_code=400, detail=f"Source path does not exist: {request.source_path}")

    # Collect video files
    if source.is_file():
        videos = [source] if source.suffix.lower() in VIDEO_EXTENSIONS else []
    else:
        videos = sorted(
            f for f in source.rglob("*")
            if f.is_file() and f.suffix.lower() in VIDEO_EXTENSIONS
        )

    if not videos:
        raise HTTPException(status_code=400, detail="No video files found at the given path.")

    # Ensure project directory exists
    project.mkdir(parents=True, exist_ok=True)

    all_frames = []
    for video in videos:
        frames = extract_random_frames(video, project, count=request.count)
        for f in frames:
            all_frames.append(ExtractedFrameInfo(
                path=f.path,
                filename=f.filename,
                timestamp=f.timestamp,
                width=f.width,
                height=f.height,
            ))

    return ExtractFramesResponse(
        total_videos=len(videos),
        total_frames=len(all_frames),
        frames=all_frames,
    )


# ── Serve Extracted Photos ──────────────────────────────────────────

@app.get("/static-photo")
def serve_photo(path: str):
    """Serve an extracted frame image from the local filesystem."""
    photo = Path(path).resolve()
    if not photo.exists():
        raise HTTPException(status_code=404, detail="Photo not found")
    if photo.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
        raise HTTPException(status_code=400, detail="Not an image file")
    return FileResponse(str(photo), media_type=f"image/{photo.suffix.lstrip('.').lower()}")


# ── Static Frontend (must be mounted LAST) ─────────────────────────
_frontend_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"

if _frontend_dist.exists():
    _assets = _frontend_dist / "assets"
    if _assets.exists():
        app.mount("/assets", StaticFiles(directory=_assets), name="static-assets")

    @app.get("/")
    async def serve_frontend():
        return FileResponse(_frontend_dist / "index.html")
