"""
DFVG Scene Detection & Auto-Tagging.

Uses FFmpeg filters to analyze video content:
- Scene change detection via ``select`` filter with scene score
- Motion scoring via frame-difference analysis
- Brightness analysis for low-light detection
- Auto-tags clips: high_motion, static, low_light, multi_scene
"""

import logging
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger("dfvg.scene_detect")


@dataclass
class SceneInfo:
    """A detected scene boundary."""
    timestamp: float       # seconds
    score: float           # 0.0–1.0 scene change magnitude
    frame_number: int = 0


@dataclass
class ClipAnalysis:
    """Full analysis result for a video clip."""
    scene_count: int = 0
    scenes: List[SceneInfo] = field(default_factory=list)
    motion_score: float = 0.0       # 0 = static, 1 = extreme motion
    avg_brightness: float = 0.0     # 0–255
    tags: List[str] = field(default_factory=list)


def detect_scenes(video_path: Path, threshold: float = 0.3, max_scenes: int = 100) -> List[SceneInfo]:
    """
    Detect scene changes using FFmpeg's scene detection filter.

    Args:
        threshold: Scene change sensitivity (0.0–1.0). Lower = more sensitive.
        max_scenes: Cap the number of detected scenes.
    """
    cmd = [
        "ffmpeg",
        "-i", str(video_path),
        "-vf", f"select='gt(scene,{threshold})',showinfo",
        "-f", "null",
        "-vsync", "vfr",
        "-"
    ]

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=300,
        )
    except subprocess.TimeoutExpired:
        logger.warning("Scene detection timed out for %s", video_path.name)
        return []
    except Exception as e:
        logger.warning("Scene detection error for %s: %s", video_path.name, e)
        return []

    # Parse showinfo output from stderr
    # Format: [Parsed_showinfo...] n:   5 pts:   5005 ... pos:... fmt:... s:... ...
    # We also need the pts_time
    scenes: List[SceneInfo] = []
    pts_pattern = re.compile(r"pts_time:\s*([\d.]+)")
    n_pattern = re.compile(r"\bn:\s*(\d+)")

    for line in result.stderr.split("\n"):
        if "showinfo" not in line.lower():
            continue
        pts_match = pts_pattern.search(line)
        n_match = n_pattern.search(line)
        if pts_match:
            ts = float(pts_match.group(1))
            n = int(n_match.group(1)) if n_match else 0
            scenes.append(SceneInfo(timestamp=ts, score=threshold, frame_number=n))
            if len(scenes) >= max_scenes:
                break

    logger.info("Detected %d scenes in %s", len(scenes), video_path.name)
    return scenes


def compute_motion_score(video_path: Path, sample_duration: float = 30.0) -> float:
    """
    Estimate motion level by measuring inter-frame differences.

    Samples the first ``sample_duration`` seconds. Returns 0.0–1.0 score.
    Uses FFmpeg ``mpdecimate`` filter's dropped-frame ratio as a proxy:
    more dropped frames = more static footage.
    """
    cmd = [
        "ffmpeg",
        "-t", str(sample_duration),
        "-i", str(video_path),
        "-vf", "mpdecimate=hi=64*12:lo=64*5:frac=0.33,showinfo",
        "-f", "null",
        "-vsync", "vfr",
        "-"
    ]

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=120,
        )
    except (subprocess.TimeoutExpired, Exception):
        return 0.5  # unknown

    # Count frames that passed (weren't dropped)
    frame_count = sum(1 for line in result.stderr.split("\n") if "showinfo" in line.lower())

    # Estimate total input frames from duration and assumed ~30fps
    estimated_total = sample_duration * 30.0

    if estimated_total <= 0:
        return 0.5

    # Ratio of kept frames → higher = more motion
    ratio = min(1.0, frame_count / estimated_total)
    return round(ratio, 2)


def measure_brightness(video_path: Path, sample_duration: float = 10.0) -> float:
    """
    Measure average brightness of the video using signalstats filter.

    Returns average Y (luma) value (0–255). Values < 40 suggest low light.
    """
    cmd = [
        "ffmpeg",
        "-t", str(sample_duration),
        "-i", str(video_path),
        "-vf", "signalstats=stat=tout+vrep+brng,metadata=mode=print",
        "-f", "null",
        "-"
    ]

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=60,
        )
    except (subprocess.TimeoutExpired, Exception):
        return 128.0  # default middle

    # Parse lavfi.signalstats.YAVG from stderr
    yavg_re = re.compile(r"lavfi\.signalstats\.YAVG=(\d+\.?\d*)")
    values = []
    for line in result.stderr.split("\n"):
        match = yavg_re.search(line)
        if match:
            values.append(float(match.group(1)))

    if not values:
        return 128.0

    return sum(values) / len(values)


def analyze_clip(video_path: Path, duration: float = 0.0) -> ClipAnalysis:
    """
    Full clip analysis: scenes, motion, brightness, auto-tags.

    Args:
        duration: Clip duration in seconds (used for motion sampling).
    """
    analysis = ClipAnalysis()

    # Scene detection
    scenes = detect_scenes(video_path)
    analysis.scenes = scenes
    analysis.scene_count = len(scenes)

    # Motion scoring
    sample = min(duration, 30.0) if duration > 0 else 30.0
    analysis.motion_score = compute_motion_score(video_path, sample_duration=sample)

    # Brightness
    analysis.avg_brightness = measure_brightness(video_path, sample_duration=10.0)

    # Auto-tags
    if analysis.motion_score >= 0.7:
        analysis.tags.append("high_motion")
    elif analysis.motion_score <= 0.2:
        analysis.tags.append("static")

    if analysis.avg_brightness < 40:
        analysis.tags.append("low_light")
    elif analysis.avg_brightness > 220:
        analysis.tags.append("overexposed")

    if analysis.scene_count >= 5:
        analysis.tags.append("multi_scene")
    elif analysis.scene_count == 0:
        analysis.tags.append("single_take")

    logger.info(
        "Analysis %s: %d scenes, motion=%.2f, brightness=%.0f, tags=%s",
        video_path.name, analysis.scene_count, analysis.motion_score,
        analysis.avg_brightness, analysis.tags,
    )
    return analysis
