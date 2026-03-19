"""
DFVG Random Frame Extractor – High-Quality Still Extraction.

Extracts N random frames from video clips as full-resolution, lossless PNG
images suitable for thumbnails, social media, or quality inspection.

Output directory: ``05_PHOTOS/{video_stem}/``
"""

import logging
import random
import subprocess
from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel

logger = logging.getLogger("dfvg.frame_extractor")

DIR_PHOTOS = "05_PHOTOS"


class ExtractedFrame(BaseModel):
    """Metadata for a single extracted frame."""
    path: str
    filename: str
    timestamp: float
    width: int
    height: int


def extract_random_frames(
    video_path: Path,
    output_dir: Path,
    count: int = 5,
    buffer_seconds: float = 0.5,
    seed: Optional[int] = None,
) -> List[ExtractedFrame]:
    """
    Extract ``count`` random frames from a video as full-resolution PNGs.

    Args:
        video_path: Path to the source video file.
        output_dir: Project root directory (frames go into ``05_PHOTOS/``).
        count: Number of random frames to extract (default 5).
        buffer_seconds: Avoid frames within this many seconds of start/end.
        seed: Optional random seed for reproducibility.

    Returns:
        List of ExtractedFrame objects with paths and metadata.
    """
    # Get video duration via ffprobe
    duration = _get_duration(video_path)
    if duration <= 0:
        logger.warning("Cannot determine duration for %s", video_path.name)
        return []

    # Compute safe range
    t_min = min(buffer_seconds, duration * 0.1)
    t_max = max(duration - buffer_seconds, duration * 0.9)
    if t_max <= t_min:
        t_min, t_max = 0, duration

    # Generate sorted random timestamps
    rng = random.Random(seed)
    timestamps = sorted(rng.uniform(t_min, t_max) for _ in range(count))

    # Prepare output directory
    photos_dir = output_dir / DIR_PHOTOS / video_path.stem
    photos_dir.mkdir(parents=True, exist_ok=True)

    results: List[ExtractedFrame] = []

    for i, ts in enumerate(timestamps):
        out_file = photos_dir / f"{video_path.stem}_frame_{i + 1:03d}.png"

        cmd = [
            "ffmpeg", "-y",
            "-ss", f"{ts:.3f}",
            "-i", str(video_path),
            "-vframes", "1",
            "-compression_level", "0",  # fastest PNG encoding, lossless
            str(out_file),
        ]

        try:
            subprocess.run(
                cmd, capture_output=True, text=True, timeout=30,
            )

            if out_file.exists():
                # Get dimensions from ffprobe
                w, h = _get_dimensions(out_file)
                frame = ExtractedFrame(
                    path=str(out_file),
                    filename=out_file.name,
                    timestamp=round(ts, 3),
                    width=w,
                    height=h,
                )
                results.append(frame)
                logger.info(
                    "Extracted frame %d/%d at %.2fs → %s",
                    i + 1, count, ts, out_file.name,
                )
            else:
                logger.warning("Frame extraction failed at %.2fs for %s", ts, video_path.name)

        except subprocess.TimeoutExpired:
            logger.warning("Frame extraction timed out at %.2fs for %s", ts, video_path.name)
        except Exception as e:
            logger.warning("Frame extraction error at %.2fs for %s: %s", ts, video_path.name, e)

    logger.info(
        "Extracted %d/%d frames from %s", len(results), count, video_path.name,
    )
    return results


def _get_duration(video_path: Path) -> float:
    """Get video duration in seconds via ffprobe."""
    cmd = [
        "ffprobe", "-v", "quiet",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(video_path),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        return float(result.stdout.strip())
    except Exception:
        return 0.0


def _get_dimensions(image_path: Path) -> tuple[int, int]:
    """Get image width and height via ffprobe."""
    cmd = [
        "ffprobe", "-v", "quiet",
        "-show_entries", "stream=width,height",
        "-of", "csv=p=0:s=x",
        str(image_path),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        parts = result.stdout.strip().split("x")
        return int(parts[0]), int(parts[1])
    except Exception:
        return 0, 0
