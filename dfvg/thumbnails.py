"""
DFVG Thumbnail & Contact Sheet Generator.

Extracts representative frames from video clips using FFmpeg:
- Single thumbnail (poster frame) at 1-second mark
- Contact sheet grid (4×3 = 12 frames evenly distributed)
"""

import logging
import subprocess
from pathlib import Path

logger = logging.getLogger("dfvg.thumbnails")

DIR_THUMBNAILS = "THUMBNAILS"


def extract_thumbnail(
    video_path: Path,
    output_dir: Path,
    timestamp: str = "00:00:01",
    size: str = "640:-1",
) -> Path:
    """
    Extract a single JPEG thumbnail at the given timestamp.

    Returns the path to the generated thumbnail.
    """
    thumb_dir = output_dir / DIR_THUMBNAILS
    thumb_dir.mkdir(parents=True, exist_ok=True)
    out_path = thumb_dir / f"{video_path.stem}.jpg"

    if out_path.exists():
        return out_path

    cmd = [
        "ffmpeg", "-y",
        "-ss", timestamp,
        "-i", str(video_path),
        "-vframes", "1",
        "-vf", f"scale={size}",
        "-q:v", "2",
        str(out_path),
    ]

    try:
        subprocess.run(
            cmd, capture_output=True, text=True, timeout=30,
        )
        if out_path.exists():
            logger.info("Thumbnail: %s", out_path.name)
        else:
            logger.warning("Thumbnail generation failed for %s", video_path.name)
    except subprocess.TimeoutExpired:
        logger.warning("Thumbnail timed out for %s", video_path.name)
    except Exception as e:
        logger.warning("Thumbnail error for %s: %s", video_path.name, e)

    return out_path


def generate_contact_sheet(
    video_path: Path,
    output_dir: Path,
    duration: float,
    cols: int = 4,
    rows: int = 3,
    tile_width: int = 320,
) -> Path:
    """
    Generate a contact sheet (grid of evenly-spaced frames) in a single FFmpeg pass.

    Uses ``select`` + ``tile`` filters to produce a cols×rows grid.
    Returns the path to the generated contact sheet.
    """
    thumb_dir = output_dir / DIR_THUMBNAILS
    thumb_dir.mkdir(parents=True, exist_ok=True)
    out_path = thumb_dir / f"{video_path.stem}_sheet.jpg"

    if out_path.exists():
        return out_path

    total_frames = cols * rows
    if duration <= 0:
        return out_path

    # Calculate interval between selected frames
    interval = duration / (total_frames + 1)

    # Build select expression: pick one frame every `interval` seconds
    # Using `isnan(prev_selected_t)+gte(t-prev_selected_t,{interval})`
    select_expr = f"isnan(prev_selected_t)+gte(t-prev_selected_t\\,{interval:.2f})"

    vf = (
        f"select='{select_expr}',"
        f"scale={tile_width}:-1,"
        f"tile={cols}x{rows}:padding=4:margin=4:color=0x1a1a2e"
    )

    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-vf", vf,
        "-frames:v", "1",
        "-q:v", "3",
        "-vsync", "vfr",
        str(out_path),
    ]

    try:
        subprocess.run(
            cmd, capture_output=True, text=True, timeout=120,
        )
        if out_path.exists():
            logger.info("Contact sheet: %s", out_path.name)
        else:
            logger.warning("Contact sheet failed for %s", video_path.name)
    except subprocess.TimeoutExpired:
        logger.warning("Contact sheet timed out for %s", video_path.name)
    except Exception as e:
        logger.warning("Contact sheet error for %s: %s", video_path.name, e)

    return out_path
