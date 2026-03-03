from pydantic import BaseModel
from typing import List, Optional
from enum import Enum

class ClipInfo(BaseModel):
    filename: str
    width: int
    height: int
    fps: float
    duration: float
    video_codec: str
    bit_depth: int
    camera_model: Optional[str] = None
    color_profile: str

class ScanResponse(BaseModel):
    path: str
    clips: List[ClipInfo]

class ProcessingMode(str, Enum):
    A = "A"
    B = "B"
    FULL = "FULL"

class JobRequest(BaseModel):
    input_path: str
    mode: ProcessingMode = ProcessingMode.FULL


class IngestRequest(BaseModel):
    project_path: str
    source_path: str
    process_after: bool = False
    mode: ProcessingMode = ProcessingMode.FULL


class IngestFileInfo(BaseModel):
    source: str
    destination: str
    sidecar_count: int = 0
    split_group: Optional[str] = None
    skipped: bool = False
    skip_reason: Optional[str] = None


class IngestPlanResponse(BaseModel):
    total_found: int
    to_copy: int
    skipped: int
    sidecar_count: int = 0
    is_dji_source: bool = False
    files: List[IngestFileInfo]


class DetectedDriveInfo(BaseModel):
    path: str
    label: str
    is_dji: bool
    detected_at: str
    video_count: int = 0

class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    progress: float
    current_file: Optional[str] = None
    message: Optional[str] = None
    output_dir: Optional[str] = None
    manifest_path: Optional[str] = None


class RunInfo(BaseModel):
    run_id: str
    status: str
    mode: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    total: int = 0
    completed: int = 0
    failed: int = 0
    manifest_path: Optional[str] = None


class VerifyResponse(BaseModel):
    run_id: str
    total_outputs: int
    passed: int
    failed: int
    missing: int
    all_verified: bool
    mismatches: List[dict] = []


class CleanupRequest(BaseModel):
    project_path: str


class CleanupResponse(BaseModel):
    safe: bool
    reason: str
    files_deleted: int = 0
    bytes_freed: int = 0
