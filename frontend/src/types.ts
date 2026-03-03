// ── DFVG Shared Types ────────────────────────────────────────────

export interface ClipInfo {
    filename: string; width: number; height: number; fps: number
    duration: number; video_codec: string; bit_depth: number
    camera_model?: string; color_profile: string
    scene_count?: number; motion_score?: number; avg_brightness?: number
    tags?: string[]; gps_summary?: GpsSummary
}

export interface GpsSummary {
    start_lat: number; start_lon: number; end_lat: number; end_lon: number
    total_distance_m: number; max_alt: number; avg_speed_kmh: number
}

export interface ScanResponse { path: string; clips: ClipInfo[] }

export interface JobResponse {
    job_id: string; status: 'pending' | 'processing' | 'completed' | 'failed'
    progress: number; current_file?: string; message?: string
    manifest_path?: string; output_dir?: string
}

export interface RunInfo {
    run_id: string; status: string; mode: string
    started_at?: string; completed_at?: string
    total: number; completed: number; failed: number
    manifest_path?: string
}

export interface VerifyResult {
    total_outputs: number; passed: number; failed: number; missing: number
    all_verified: boolean
}

export interface IngestFileInfo {
    source: string; destination: string; sidecar_count: number
    split_group?: string; skipped: boolean; skip_reason?: string
}

export interface IngestPlan {
    total_found: number; to_copy: number; skipped: number
    sidecar_count: number; is_dji_source: boolean; files: IngestFileInfo[]
}

export interface DetectedDrive {
    path: string; label: string; is_dji: boolean
    detected_at: string; video_count: number
}

export type TabId = 'sources' | 'projects' | 'runs' | 'settings'
export type ProcessingMode = 'A' | 'B' | 'FULL'
