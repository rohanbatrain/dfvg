"""
DJI SRT Subtitle Parser — extracts GPS, camera settings, and telemetry.

DJI Action cameras embed metadata in .SRT sidecar files with per-frame data:
- GPS coordinates (lat, lon, altitude)
- Camera settings (ISO, shutter speed, aperture, EV)
- Distance from home point

Outputs structured data and optional GPX export for mapping tools.
"""

import logging
import math
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger("dfvg.srt_parser")

# ── DJI SRT line patterns ─────────────────────────────────────────
# Format varies by firmware, common patterns:
#   F/2.8, SS 250, ISO 100, EV 0, GPS (28.6139, 77.2090, 15), D 5.2m
#   [iso: 200] [shutter: 1/120] [fnum: 280] [ev: 0] [GPS (lat, lon, alt)] [distance: 5.2m]
_TIMESTAMP_RE = re.compile(
    r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})"
)
_GPS_RE = re.compile(
    r"GPS\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)"
)
_ISO_RE = re.compile(r"(?:ISO|iso[:\s])\s*(\d+)", re.IGNORECASE)
_SHUTTER_RE = re.compile(r"(?:SS|shutter[:\s])\s*(?:1/)?(\d+)", re.IGNORECASE)
_EV_RE = re.compile(r"(?:EV|ev[:\s])\s*(-?[\d.]+)", re.IGNORECASE)
_FNUM_RE = re.compile(r"(?:F/|fnum[:\s])\s*(\d+\.?\d*)", re.IGNORECASE)
_DIST_RE = re.compile(r"(?:D|distance[:\s])\s*([\d.]+)\s*m", re.IGNORECASE)


@dataclass
class SRTFrame:
    """Single frame/subtitle entry from a DJI SRT file."""
    index: int
    start_seconds: float
    end_seconds: float
    gps_lat: Optional[float] = None
    gps_lon: Optional[float] = None
    gps_alt: Optional[float] = None
    iso: Optional[int] = None
    shutter_speed: Optional[int] = None
    aperture: Optional[float] = None
    ev: Optional[float] = None
    distance: Optional[float] = None
    raw_text: str = ""


@dataclass
class GPSSummary:
    """Aggregated GPS data from an SRT file."""
    start_lat: Optional[float] = None
    start_lon: Optional[float] = None
    end_lat: Optional[float] = None
    end_lon: Optional[float] = None
    min_alt: float = 0.0
    max_alt: float = 0.0
    total_distance_m: float = 0.0
    avg_speed_kmh: float = 0.0
    point_count: int = 0
    duration_seconds: float = 0.0


def _parse_timestamp(h: str, m: str, s: str, ms: str) -> float:
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000.0


def parse_dji_srt(srt_path: Path) -> List[SRTFrame]:
    """
    Parse a DJI .SRT file into structured frame data.

    Handles multiple DJI SRT formats (Action 2, 4, 5 Pro).
    """
    if not srt_path.exists():
        return []

    text = srt_path.read_text(errors="replace")
    blocks = re.split(r"\n\s*\n", text.strip())
    frames: List[SRTFrame] = []

    for block in blocks:
        lines = block.strip().split("\n")
        if len(lines) < 2:
            continue

        # First line: subtitle index
        try:
            index = int(lines[0].strip())
        except ValueError:
            continue

        # Second line: timestamp range
        ts_match = _TIMESTAMP_RE.search(lines[1])
        if not ts_match:
            continue

        g = ts_match.groups()
        start = _parse_timestamp(g[0], g[1], g[2], g[3])
        end = _parse_timestamp(g[4], g[5], g[6], g[7])

        # Remaining lines: metadata
        meta_text = " ".join(lines[2:])

        frame = SRTFrame(index=index, start_seconds=start, end_seconds=end, raw_text=meta_text)

        # GPS
        gps_match = _GPS_RE.search(meta_text)
        if gps_match:
            frame.gps_lat = float(gps_match.group(1))
            frame.gps_lon = float(gps_match.group(2))
            frame.gps_alt = float(gps_match.group(3))

        # Camera settings
        iso = _ISO_RE.search(meta_text)
        if iso:
            frame.iso = int(iso.group(1))
        ss = _SHUTTER_RE.search(meta_text)
        if ss:
            frame.shutter_speed = int(ss.group(1))
        fnum = _FNUM_RE.search(meta_text)
        if fnum:
            frame.aperture = float(fnum.group(1))
        ev = _EV_RE.search(meta_text)
        if ev:
            frame.ev = float(ev.group(1))
        dist = _DIST_RE.search(meta_text)
        if dist:
            frame.distance = float(dist.group(1))

        frames.append(frame)

    logger.info("Parsed %d SRT frames from %s", len(frames), srt_path.name)
    return frames


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance in meters between two GPS coordinates."""
    R = 6371000  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def get_gps_summary(frames: List[SRTFrame]) -> Optional[GPSSummary]:
    """Compute aggregated GPS stats from parsed SRT frames."""
    gps_frames = [f for f in frames if f.gps_lat is not None and f.gps_lon is not None]
    if not gps_frames:
        return None

    summary = GPSSummary(
        start_lat=gps_frames[0].gps_lat,
        start_lon=gps_frames[0].gps_lon,
        end_lat=gps_frames[-1].gps_lat,
        end_lon=gps_frames[-1].gps_lon,
        point_count=len(gps_frames),
    )

    alts = [f.gps_alt for f in gps_frames if f.gps_alt is not None]
    if alts:
        summary.min_alt = min(alts)
        summary.max_alt = max(alts)

    # Total distance
    total_dist = 0.0
    for i in range(1, len(gps_frames)):
        total_dist += _haversine(
            gps_frames[i - 1].gps_lat, gps_frames[i - 1].gps_lon,
            gps_frames[i].gps_lat, gps_frames[i].gps_lon,
        )
    summary.total_distance_m = total_dist

    # Duration and speed
    if len(gps_frames) >= 2:
        summary.duration_seconds = gps_frames[-1].end_seconds - gps_frames[0].start_seconds
        if summary.duration_seconds > 0:
            summary.avg_speed_kmh = (total_dist / 1000) / (summary.duration_seconds / 3600)

    return summary


def export_gpx(frames: List[SRTFrame], output_path: Path) -> Path:
    """Export GPS track as a standard GPX file."""
    gps_frames = [f for f in frames if f.gps_lat is not None and f.gps_lon is not None]

    gpx = ET.Element("gpx", version="1.1", creator="DFVG",
                     xmlns="http://www.topografix.com/GPX/1/1")
    trk = ET.SubElement(gpx, "trk")
    ET.SubElement(trk, "name").text = output_path.stem
    trkseg = ET.SubElement(trk, "trkseg")

    for f in gps_frames:
        trkpt = ET.SubElement(trkseg, "trkpt", lat=str(f.gps_lat), lon=str(f.gps_lon))
        if f.gps_alt is not None:
            ET.SubElement(trkpt, "ele").text = f"{f.gps_alt:.1f}"

    tree = ET.ElementTree(gpx)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tree.write(str(output_path), xml_declaration=True, encoding="utf-8")
    logger.info("GPX exported: %s (%d points)", output_path.name, len(gps_frames))
    return output_path
