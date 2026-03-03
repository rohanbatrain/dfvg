import json
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional
from pydantic import BaseModel

class ClipMetadata(BaseModel):
    file_path: Path
    filename: str
    width: int
    height: int
    fps: float
    duration: float
    video_codec: str
    audio_codec: Optional[str] = None
    bit_depth: int
    color_profile: str  # "Normal", "D-Cinelike", "D-Log M"
    camera_model: Optional[str] = None
    creation_date: Optional[str] = None
    # Scene analysis (populated post-detection)
    scene_count: int = 0
    motion_score: float = 0.0
    avg_brightness: float = 128.0
    tags: list[str] = []
    # GPS summary (from SRT sidecar)
    gps_summary: Optional[Dict[str, Any]] = None

class Detector:
    def probe(self, file_path: Path) -> ClipMetadata:
        cmd = [
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            str(file_path)
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise ValueError(f"ffprobe failed for {file_path}")
            
        data = json.loads(result.stdout)
        
        video_stream = next((s for s in data["streams"] if s["codec_type"] == "video"), None)
        audio_stream = next((s for s in data["streams"] if s["codec_type"] == "audio"), None)
        format_info = data["format"]
        
        if not video_stream:
            raise ValueError(f"No video stream found in {file_path}")

        # Extract basic info
        width = int(video_stream.get("width", 0))
        height = int(video_stream.get("height", 0))
        
        fps_fraction = video_stream.get("r_frame_rate", "30/1")
        num, den = map(int, fps_fraction.split('/'))
        fps = num / den if den != 0 else 0.0
        
        duration = float(format_info.get("duration", 0))
        video_codec = video_stream.get("codec_name", "unknown")
        audio_codec = audio_stream.get("codec_name") if audio_stream else None
        
        # Determine bit depth
        pix_fmt = video_stream.get("pix_fmt", "")
        if "10le" in pix_fmt or "10be" in pix_fmt:
            bit_depth = 10
        elif "12le" in pix_fmt or "12be" in pix_fmt:
            bit_depth = 12
        else:
            bit_depth = 8
            
        # Attempt to determine camera model from metadata
        tags = format_info.get("tags", {})
        # Different cameras store model in different tags
        camera_model = tags.get("model") or tags.get("com.dji.device.name")
        
        # Determine creation date
        creation_date = tags.get("creation_time")
        if not creation_date and video_stream:
            creation_date = video_stream.get("tags", {}).get("creation_time")
        if not creation_date:
            # Fallback to OS modification time
            import os
            from datetime import datetime
            mtime = os.path.getmtime(file_path)
            creation_date = datetime.fromtimestamp(mtime).isoformat()

        
        # Determine Color Profile
        # Heuristic based on DJI behavior and known constraints
        color_profile = "Normal"
        
        # Explicit D-Log M check (often difficult with just ffprobe, need heuristics)
        # 10-bit + Action 5 Pro usually means D-Log M if not explicitly stated otherwise? 
        # Actually DJI files might not tag 'D-Log M' explicitly in standard tags.
        # We use the heuristics defined in the PROMPT:
        # Action 5 Pro + 10-bit -> Likely D-Log M (safe assumption for this workflow per user)
        # Action 2 (usually 8-bit, or flat-ish) -> D-Cinelike check?
        
        # Heuristic 1: 10-bit is a strong indicator of D-Log M on Action 4/5
        if bit_depth == 10:
             color_profile = "D-Log M"
        
        # Heuristic 2: Action 2 D-Cinelike looks flat but is often 8-bit.
        # There isn't a solid metadata flag for D-Cinelike in standard ffprobe output for Action 2.
        # However, for this project, we might default Action 2 to "D-Cinelike" if it's the "Flat" profile,
        # but the user said "Action 2 ... D-Cinelike (flat Rec709)".
        # Without explicit metadata, we might have to assume based on user intent or folder structure?
        # Let's try to look for 'D-Cinelike' in any tag.
        
        # Currently, if we act strictly on user prompt: 
        # "DJI Action 5 Pro -> D-Log M (10-bit)"
        # "DJI Action 2 -> D-Cinelike"
        
        if camera_model and "Action 5 Pro" in camera_model and bit_depth == 10:
            color_profile = "D-Log M"
        elif camera_model and "Action 2" in camera_model:
            # Action 2 D-Cinelike identification is tricky without user input or specific metadata.
            # Assuming 'Normal' unless we find a reason not to.
            # BUT, the prompt implies we distinguish. 
            # Often DJI clips have custom data. 
            # For now, default Action 2 to D-Cinelike if detection is ambiguous? 
            # Or perhaps default to Normal and let user override?
            # Let's default to D-Cinelike for Action 2 as the user implies it's a common heavy use case.
            # CHECK: "DJI Action 2 does NOT shoot true Log... It uses D-Cinelike"
            # It implies standard profile is Normal, and D-Cinelike is an option.
            # Since we can't easily detect D-Cinelike via generic ffprobe without parsing the binary data in 'djmd',
            # We will default to Normal for 8-bit unless we spy 'D-Cinelike' in `major_brand` or similar?
            # Let's assume Normal for safety, unless 10-bit (which Action 2 isn't).
            pass
            
        return ClipMetadata(
            file_path=file_path,
            filename=file_path.name,
            width=width,
            height=height,
            fps=fps,
            duration=duration,
            video_codec=video_codec,
            audio_codec=audio_codec,
            bit_depth=bit_depth,
            color_profile=color_profile,
            camera_model=camera_model,
            creation_date=creation_date
        )
