"""
DFVG Batch Report Generator.

Produces a self-contained REPORT.html after each processing run with:
- Run summary (ID, status, timing, mode)
- Clip gallery with thumbnails
- Per-clip metadata, GPS data, scene analysis
- Storage breakdown
- Verification status badge
"""

import base64
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("dfvg.report")

DIR_THUMBNAILS = "THUMBNAILS"


def _b64_image(path: Path) -> str:
    """Encode an image file as a base64 data URI."""
    if not path.exists():
        return ""
    data = path.read_bytes()
    return f"data:image/jpeg;base64,{base64.b64encode(data).decode()}"


def _format_duration(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h > 0:
        return f"{h}h {m}m {s}s"
    return f"{m}m {s}s"


def _format_size(bytes_val: int) -> str:
    if bytes_val >= 1024 ** 3:
        return f"{bytes_val / 1024**3:.2f} GB"
    if bytes_val >= 1024 ** 2:
        return f"{bytes_val / 1024**2:.1f} MB"
    return f"{bytes_val / 1024:.0f} KB"


def _dir_size(path: Path) -> int:
    """Total size of all files in a directory (recursive)."""
    if not path.exists():
        return 0
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())


def generate_report(
    project_dir: Path,
    manifest_data: Dict[str, Any],
    clips_metadata: List[Dict[str, Any]],
    analysis_results: Optional[List[Dict[str, Any]]] = None,
) -> Path:
    """
    Generate REPORT.html — a self-contained HTML report.

    Args:
        project_dir: Project root directory.
        manifest_data: Manifest dict (from RunManifest.data.model_dump()).
        clips_metadata: List of clip metadata dicts.
        analysis_results: Optional scene analysis results per clip.
    """
    report_path = project_dir / "REPORT.html"
    thumb_dir = project_dir / DIR_THUMBNAILS

    # ── Gather data ───────────────────────────────────────────────
    run_id = manifest_data.get("run_id", "unknown")
    status = manifest_data.get("status", "UNKNOWN")
    mode = manifest_data.get("mode", "FULL")
    started = manifest_data.get("started_at", "")
    completed = manifest_data.get("completed_at", "")
    summary = manifest_data.get("summary", {})

    # Storage breakdown
    originals_size = _dir_size(project_dir / "01_ORIGINALS")
    audio_size = _dir_size(project_dir / "audio")
    no_audio_size = _dir_size(project_dir / "without_audio")
    total_output = audio_size + no_audio_size

    # Status badge
    badge_color = "#22c55e" if status == "COMPLETED" else "#ef4444" if status == "FAILED" else "#eab308"

    # Build clip cards
    clip_cards = []
    for i, clip in enumerate(clips_metadata):
        filename = clip.get("filename", "unknown")
        stem = Path(filename).stem

        thumb_path = thumb_dir / f"{stem}.jpg"
        thumb_b64 = _b64_image(thumb_path) if thumb_path.exists() else ""

        # Analysis data
        analysis = {}
        if analysis_results and i < len(analysis_results):
            analysis = analysis_results[i] or {}

        tags_html = ""
        if analysis.get("tags"):
            tags_html = " ".join(
                f'<span class="tag">{t}</span>' for t in analysis["tags"]
            )

        gps_html = ""
        if clip.get("gps_summary"):
            gs = clip["gps_summary"]
            gps_html = f"""
            <div class="gps">
                📍 {gs.get('start_lat', 0):.4f}, {gs.get('start_lon', 0):.4f}
                → {gs.get('end_lat', 0):.4f}, {gs.get('end_lon', 0):.4f}<br>
                📏 {gs.get('total_distance_m', 0):.0f}m
                ⬆ {gs.get('max_alt', 0):.0f}m
                🏃 {gs.get('avg_speed_kmh', 0):.1f} km/h
            </div>"""

        card = f"""
        <div class="clip-card">
            {'<img src="' + thumb_b64 + '" alt="' + filename + '">' if thumb_b64 else '<div class="no-thumb">🎬</div>'}
            <div class="clip-info">
                <h3>{filename}</h3>
                <p>{clip.get('width', 0)}×{clip.get('height', 0)} · {clip.get('fps', 0):.0f}fps · {_format_duration(clip.get('duration', 0))}</p>
                <p>{clip.get('video_codec', '')} · {clip.get('bit_depth', 8)}-bit · {clip.get('color_profile', 'Normal')}</p>
                <p>📷 {clip.get('camera_model', 'Unknown')}</p>
                {f'<p>🎬 {analysis.get("scene_count", 0)} scenes · Motion: {analysis.get("motion_score", 0):.0%} · Brightness: {analysis.get("avg_brightness", 0):.0f}</p>' if analysis else ''}
                {tags_html}
                {gps_html}
            </div>
        </div>"""
        clip_cards.append(card)

    clips_html = "\n".join(clip_cards)

    # ── Processing time chart ─────────────────────────────────────
    files_data = manifest_data.get("files", [])
    time_bars = []
    for fd in files_data:
        fname = fd.get("filename", "?")
        if fd.get("started_at") and fd.get("completed_at"):
            try:
                st = datetime.fromisoformat(fd["started_at"])
                et = datetime.fromisoformat(fd["completed_at"])
                secs = (et - st).total_seconds()
                time_bars.append(f'<div class="time-bar"><span class="time-label">{fname}</span><div class="time-fill" style="width:{min(100, secs/2)}%">{secs:.1f}s</div></div>')
            except Exception:
                pass

    timeline_html = "\n".join(time_bars) if time_bars else "<p>No timing data available</p>"

    # ── HTML ──────────────────────────────────────────────────────
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DFVG Report — {run_id}</title>
<style>
  :root {{ --bg: #0f0f1a; --card: #1a1a2e; --border: #2a2a3e; --text: #e0e0e8; --dim: #888; --accent: #6366f1; }}
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); padding: 2rem; line-height: 1.6; }}
  .header {{ text-align: center; margin-bottom: 2rem; }}
  .header h1 {{ font-size: 1.8rem; margin-bottom: 0.5rem; }}
  .badge {{ display: inline-block; padding: 4px 16px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; color: #fff; background: {badge_color}; }}
  .stats {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }}
  .stat-card {{ background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.2rem; text-align: center; }}
  .stat-card .value {{ font-size: 1.5rem; font-weight: 700; color: var(--accent); }}
  .stat-card .label {{ font-size: 0.8rem; color: var(--dim); margin-top: 4px; }}
  .section {{ margin-bottom: 2rem; }}
  .section h2 {{ font-size: 1.2rem; margin-bottom: 1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }}
  .clip-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 1rem; }}
  .clip-card {{ background: var(--card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }}
  .clip-card img {{ width: 100%; height: 180px; object-fit: cover; }}
  .no-thumb {{ width: 100%; height: 180px; display: flex; align-items: center; justify-content: center; background: #111; font-size: 3rem; }}
  .clip-info {{ padding: 1rem; }}
  .clip-info h3 {{ font-size: 0.95rem; margin-bottom: 0.3rem; word-break: break-all; }}
  .clip-info p {{ font-size: 0.8rem; color: var(--dim); margin-bottom: 0.2rem; }}
  .tag {{ display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.7rem; background: var(--accent); color: #fff; margin: 2px; }}
  .gps {{ font-size: 0.75rem; color: var(--dim); margin-top: 0.3rem; padding: 0.4rem; background: rgba(99,102,241,0.1); border-radius: 6px; }}
  .time-bar {{ display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.3rem; }}
  .time-label {{ font-size: 0.75rem; color: var(--dim); min-width: 180px; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
  .time-fill {{ background: var(--accent); color: #fff; font-size: 0.7rem; padding: 2px 8px; border-radius: 4px; min-width: 40px; }}
  .footer {{ text-align: center; color: var(--dim); font-size: 0.75rem; margin-top: 2rem; }}
</style>
</head>
<body>
<div class="header">
  <h1>📹 DFVG Processing Report</h1>
  <p style="color:var(--dim)">Run {run_id} · Mode {mode}</p>
  <div class="badge">{status}</div>
</div>

<div class="stats">
  <div class="stat-card"><div class="value">{summary.get('total', 0)}</div><div class="label">Total Files</div></div>
  <div class="stat-card"><div class="value">{summary.get('completed', 0)}</div><div class="label">Completed</div></div>
  <div class="stat-card"><div class="value">{summary.get('failed', 0)}</div><div class="label">Failed</div></div>
  <div class="stat-card"><div class="value">{_format_size(originals_size)}</div><div class="label">Originals</div></div>
  <div class="stat-card"><div class="value">{_format_size(total_output)}</div><div class="label">Output</div></div>
  <div class="stat-card"><div class="value">{_format_size(originals_size + total_output)}</div><div class="label">Total Storage</div></div>
</div>

<div class="section">
  <h2>🎬 Clips ({len(clips_metadata)})</h2>
  <div class="clip-grid">
    {clips_html}
  </div>
</div>

<div class="section">
  <h2>⏱ Processing Timeline</h2>
  {timeline_html}
</div>

<div class="footer">
  Generated by DFVG · {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
</div>
</body>
</html>"""

    report_path.write_text(html)
    logger.info("Report generated: %s", report_path.name)
    return report_path
