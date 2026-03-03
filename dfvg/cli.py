import os
import sys
import shutil
import logging
from pathlib import Path
from datetime import datetime
import click
from rich.console import Console
from rich.logging import RichHandler
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn, TimeRemainingColumn
from rich.table import Table

from .config import Config, OPTION_A, OPTION_B
from .detect import Detector, ClipMetadata
from .rules import RulesEngine
from .transcode import Transcoder
from .pack import Packager
from .ingest import Ingester
from .manifest import RunManifest, compute_sha256
from .thumbnails import extract_thumbnail, generate_contact_sheet, DIR_THUMBNAILS
from .srt_parser import parse_dji_srt, get_gps_summary, export_gpx
from .scene_detect import analyze_clip
from .report import generate_report
from .image_processor import process_photos, DIR_PHOTOS

console = Console()

# Setup Logging
def setup_logging(log_dir: Path):
    log_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y_%m_%d_%H%M%S")
    log_file = log_dir / f"run_{timestamp}.txt"
    
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(log_file),
            RichHandler(console=console, show_time=False, show_path=False)
        ]
    )
    return logging.getLogger("dfvg")

def check_ffmpeg():
    if not shutil.which("ffmpeg"):
        console.print("[bold red]Error: FFmpeg not found.[/bold red]")
        console.print("Please install FFmpeg:")
        console.print("  macOS: [green]brew install ffmpeg[/green]")
        console.print("  Windows: [green]winget install ffmpeg[/green]")
        console.print("  Linux: [green]sudo apt install ffmpeg[/green]")
        sys.exit(1)
        
    if not shutil.which("ffprobe"):
        console.print("[bold red]Error: FFprobe not found.[/bold red]")
        sys.exit(1)

@click.group()
def cli():
    """DFVG - DJI Footage Variant Generator"""
    pass


# ── Ingest Command ─────────────────────────────────────────────────

@cli.command()
@click.argument("project_path", type=click.Path(exists=True, file_okay=False))
@click.option("--source", required=True, type=click.Path(exists=True, file_okay=False),
              help="Source directory to ingest from (SD card, external drive, etc.)")
@click.option("--process", "run_process", is_flag=True,
              help="Automatically process footage after ingestion")
@click.option("--mode", type=click.Choice(["A", "B", "FULL"]), default="FULL",
              help="Processing mode (only used with --process)")
@click.option("--dry-run", is_flag=True, help="Preview what would be ingested without copying")
def ingest(project_path, source, run_process, mode, dry_run):
    """Ingest footage from a source directory into the project.

    Validates DJI SD card structure (DCIM/*MEDIA/) and organizes files
    into 01_ORIGINALS/{date}/{camera}/ with sidecars and duplicate
    detection.  Use --process to transcode immediately after ingesting.
    """
    check_ffmpeg()

    project_dir = Path(project_path).resolve()
    source_dir = Path(source).resolve()
    config = Config(processing_mode=mode)
    logs_dir = project_dir / config.DIR_LOGS
    logger = setup_logging(logs_dir)

    logger.info(f"Ingesting from {source_dir} → {project_dir}")

    ingester = Ingester(config)

    # ── Scan ──────────────────────────────────────────────────────
    console.print(f"\n[bold]Scanning[/bold] {source_dir} …")
    plan = ingester.scan(source_dir, project_dir)

    # DJI validation badge
    if plan.is_dji_source:
        console.print("[bold green]✓ DJI SD card structure detected[/bold green]")
    else:
        console.print("[yellow]⚠ Not a DJI SD card — scanning as generic source[/yellow]")

    if plan.total_found == 0:
        console.print("[yellow]No video files found in source.[/yellow]")
        return

    # ── Summary Table ─────────────────────────────────────────────
    table = Table(title="Ingest Plan", show_lines=False)
    table.add_column("File", style="cyan")
    table.add_column("Destination", style="green")
    table.add_column("Sidecars", justify="center")
    table.add_column("Split", justify="center")
    table.add_column("Status", justify="center")

    for item in plan.items:
        status = "[dim]SKIP[/dim]" if item.skipped else "[bold green]COPY[/bold green]"
        sc_count = f"{len(item.sidecars)}" if item.sidecars else "[dim]—[/dim]"
        split = item.split_group or "[dim]—[/dim]"
        table.add_row(item.source.name, item.rel_display, sc_count, split, status)

    console.print(table)
    console.print(
        f"\n[bold]{plan.total_found}[/bold] videos · "
        f"[green]{plan.to_copy} to copy[/green] · "
        f"[dim]{plan.skipped} duplicates[/dim] · "
        f"[magenta]{plan.sidecar_count} sidecars[/magenta]"
    )

    if plan.to_copy == 0:
        console.print("[yellow]Nothing new to ingest.[/yellow]")
        return

    # ── Execute ───────────────────────────────────────────────────
    if dry_run:
        console.print("\n[yellow]Dry run — no files were copied.[/yellow]")
    else:
        copied = ingester.execute(plan)
        console.print(f"[bold green]Ingested {copied} videos + {plan.sidecar_count} sidecars.[/bold green]")
        logger.info("Ingestion complete: %d videos copied, %d sidecars", copied, plan.sidecar_count)

    # ── Optional: trigger processing ──────────────────────────────
    if run_process and not dry_run:
        console.print("\n[bold]Starting processing…[/bold]")
        _run_process(project_dir, config, logger)


# ── Process Command ────────────────────────────────────────────────

@cli.command()
@click.argument("input_path", type=click.Path(exists=True, file_okay=False))
@click.option("--mode", type=click.Choice(["A", "B", "FULL"]), default="FULL",
              help="Output mode: A (Compact), B (ProRes), FULL (Everything)")
@click.option("--dry-run", is_flag=True, help="Simulate processing without running FFmpeg")
@click.option("--resume", is_flag=True, help="Resume an interrupted run from the last checkpoint")
def process(input_path, mode, dry_run, resume):
    """Process footage in the specified directory.

    Expects files either in the project root or already organized
    inside 01_ORIGINALS/.  Use 'dfvg ingest' first to import from
    external sources.
    """
    check_ffmpeg()
    
    input_dir = Path(input_path).resolve()
    config = Config(processing_mode=mode)
    logs_dir = input_dir / config.DIR_LOGS
    logger = setup_logging(logs_dir)
    logger.info(f"Starting DFVG process in {input_dir}")
    logger.info(f"Mode: {mode}")
    
    _run_process(input_dir, config, logger, dry_run=dry_run, resume=resume)


def _run_process(input_dir: Path, config: Config, logger, dry_run: bool = False, resume: bool = False):
    """Shared processing pipeline with manifest tracking."""

    originals_dir = input_dir / config.DIR_ORIGINALS

    # ── Resume handling ───────────────────────────────────────────
    manifest = None
    resume_index = 0

    if resume:
        manifest = RunManifest.load_latest(input_dir)
        if manifest and manifest.is_resumable:
            resume_index = manifest.get_resume_index()
            console.print(
                f"[bold yellow]Resuming run {manifest.run_id} "
                f"from file {resume_index + 1}/{manifest.data.summary.total}[/bold yellow]"
            )
            # Reset status for resume
            manifest.data.status = "RUNNING"
            manifest.save()
        else:
            console.print("[yellow]No interrupted run found — starting fresh[/yellow]")
            manifest = None
            resume = False

    # ── Collect candidates ────────────────────────────────────────
    valid_extensions = {".mp4", ".mov", ".mkv"}
    ignore_dirs = {
        config.DIR_ORIGINALS, config.DIR_PROXIES, config.DIR_MASTERS,
        config.DIR_EXPORTS, config.DIR_LOGS, config.DIR_AUDIO, config.DIR_NO_AUDIO,
        DIR_THUMBNAILS, DIR_PHOTOS,
    }
    
    def collect_files(directory, exts, ignore):
        """Recursively collect ``(abs_path, rel_parent)`` tuples."""
        results = []
        def _walk(cur, rel):
            for item in sorted(cur.iterdir()):
                if item.is_dir():
                    if item.name in ignore or item.name.startswith("."):
                        continue
                    _walk(item, rel / item.name)
                elif item.is_file() and item.suffix.lower() in exts and not item.name.startswith("."):
                    results.append((item, rel))
        _walk(directory, Path())
        return results

    candidates = collect_files(input_dir, valid_extensions, ignore_dirs)
        
    if not candidates:
        if originals_dir.exists():
            candidates = collect_files(originals_dir, valid_extensions, set())
        
    if not candidates:
        logger.warning("No video files found.")
        console.print("[yellow]No video files found.[/yellow]")
        return

    # ── Create manifest (or reuse for resume) ─────────────────────
    if not manifest:
        manifest = RunManifest.create(input_dir, mode=config.processing_mode)
        for fp, _ in candidates:
            manifest.add_file(fp, compute_hash=not dry_run)

    # Install signal handlers for safe interruption
    if not dry_run:
        manifest.install_signal_handlers()

    originals_dir.mkdir(parents=True, exist_ok=True)
    detector = Detector()
    rules_engine = RulesEngine(config)
    transcoder = Transcoder(config)
    packager = Packager(config)
    
    processed_metadata = []
    analysis_results = []

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        TimeRemainingColumn(),
        console=console
    ) as progress:
        
        overall_task = progress.add_task("Total Progress", total=len(candidates))
        
        # Skip already-completed files on resume
        if resume and resume_index > 0:
            progress.update(overall_task, completed=resume_index)

        try:
            for idx, (file_path, source_rel_parent) in enumerate(candidates):
                # Skip already-completed files on resume
                if resume and idx < resume_index:
                    continue

                rel_parent = source_rel_parent
                display_name = str(rel_parent / file_path.name) if rel_parent != Path() else file_path.name

                # Mark processing in manifest
                file_idx = idx  # manifest indices match candidate indices
                if not dry_run:
                    manifest.mark_processing(file_idx)

                # Archive (Copy) – preserve nested structure
                archive_dir = originals_dir / rel_parent
                archive_dir.mkdir(parents=True, exist_ok=True)
                current_location = file_path
                if file_path.parent != archive_dir:
                    dest_path = archive_dir / file_path.name
                    if not dest_path.exists():
                        logger.info(f"Archiving {display_name}")
                        if not dry_run:
                            shutil.copy2(file_path, dest_path)
                    current_location = dest_path

                # Detect
                logger.debug(f"Detecting metadata for {display_name}")
                try:
                    meta = detector.probe(current_location)
                except Exception as e:
                    logger.error(f"Detection failed for {display_name}: {e}")
                    if not dry_run:
                        manifest.mark_failed(file_idx, str(e))
                    progress.advance(overall_task)
                    continue
                    
                processed_metadata.append(meta)
                logger.info(f"Detected: {meta.filename} | {meta.color_profile} | {meta.bit_depth}-bit")

                # ── Thumbnail ─────────────────────────────────────
                if not dry_run:
                    extract_thumbnail(current_location, input_dir)
                    generate_contact_sheet(current_location, input_dir, meta.duration)

                # ── SRT / GPS ─────────────────────────────────────
                srt_path = current_location.with_suffix(".SRT")
                if not srt_path.exists():
                    srt_path = current_location.with_suffix(".srt")
                if srt_path.exists():
                    srt_frames = parse_dji_srt(srt_path)
                    gps = get_gps_summary(srt_frames)
                    if gps:
                        meta.gps_summary = {
                            "start_lat": gps.start_lat, "start_lon": gps.start_lon,
                            "end_lat": gps.end_lat, "end_lon": gps.end_lon,
                            "total_distance_m": gps.total_distance_m,
                            "max_alt": gps.max_alt, "avg_speed_kmh": gps.avg_speed_kmh,
                        }
                        gpx_dir = input_dir / DIR_THUMBNAILS  # reuse thumbnails dir
                        export_gpx(srt_frames, gpx_dir / f"{current_location.stem}.gpx")

                # ── Scene Analysis ────────────────────────────────
                if not dry_run:
                    analysis = analyze_clip(current_location, duration=meta.duration)
                    meta.scene_count = analysis.scene_count
                    meta.motion_score = analysis.motion_score
                    meta.avg_brightness = analysis.avg_brightness
                    meta.tags = analysis.tags
                    analysis_results.append(analysis.__dict__)
                else:
                    analysis_results.append(None)

                # Rules
                rule = rules_engine.evaluate(meta)
                logger.info(f"Rule Applied: {rule.output_types} (LUT: {rule.apply_lut})")
                
                # Transcode
                if not dry_run:
                    output_base = input_dir
                    
                    file_task = progress.add_task(f"Processing {display_name}", total=100)
                    
                    def progress_handler(pct):
                        progress.update(file_task, completed=pct * 100)
                        
                    try:
                        transcoder.transcode(meta, rule, output_base, progress_callback=progress_handler, rel_path=rel_parent)
                        progress.update(file_task, completed=100)

                        # Hash all output files for this source
                        _register_outputs(manifest, file_idx, input_dir, config, meta, rel_parent)

                        manifest.mark_completed(file_idx)
                    except Exception as e:
                        logger.error(f"Transcoding failed for {display_name}: {e}")
                        console.print(f"[red]Failed: {display_name}[/red]")
                        manifest.mark_failed(file_idx, str(e))
                        # Clean up partial outputs for this file
                        _cleanup_partial_outputs(input_dir, config, meta, rel_parent, logger)
                    finally:
                         progress.remove_task(file_task)
                         
                progress.advance(overall_task)
                
        except KeyboardInterrupt:
            console.print("\n[bold red]Process interrupted by user.[/bold red]")
            if not dry_run:
                # manifest.mark_interrupted() already called by signal handler
                console.print(
                    f"[yellow]Manifest saved: {manifest.manifest_path.name}[/yellow]\n"
                    f"Resume with: [green]dfvg process {input_dir} --resume[/green]"
                )
            sys.exit(130)

    # Pack & Report
    if not dry_run and processed_metadata:
        console.print("Creating Editor Pack...")
        packager.create_metadata_csv(processed_metadata, input_dir)
        packager.create_editor_pack(input_dir)

        # Generate HTML report
        console.print("Generating batch report...")
        clips_dicts = [m.model_dump(mode="json") for m in processed_metadata]
        generate_report(
            project_dir=input_dir,
            manifest_data=manifest.data.model_dump(mode="json") if manifest else {},
            clips_metadata=clips_dicts,
            analysis_results=analysis_results,
        )
        console.print("[green]REPORT.html generated[/green]")

    # Photo processing
    if not dry_run:
        console.print("\n[bold]Processing photos...[/bold]")
        photo_metadata, photo_count = process_photos(
            input_dir, lut_path=config.LUT_PATH,
        )
        if photo_count > 0:
            console.print(f"[green]Processed {photo_count} photos → 05_PHOTOS/[/green]")
        else:
            console.print("[dim]No photos found[/dim]")

    # Finalize manifest
    if not dry_run:
        manifest.finalize()
        console.print(f"\n[bold green]Processing Complete![/bold green]")
        console.print(f"  Manifest: [cyan]{manifest.manifest_path.name}[/cyan]")
        console.print(
            f"  Files: {manifest.data.summary.completed} completed, "
            f"{manifest.data.summary.failed} failed, "
            f"{manifest.data.summary.skipped} skipped"
        )
        console.print(f"  Log: {input_dir / config.DIR_LOGS}")
    else:
        console.print(f"[bold green]Dry run complete![/bold green]")


def _register_outputs(manifest: RunManifest, file_idx: int, project_dir: Path,
                      config: Config, meta: ClipMetadata, rel_parent: Path):
    """Find and register all output files for a given source with checksums."""
    # Output dirs to scan for this file's outputs
    audio_dirs = [
        project_dir / config.DIR_AUDIO,
        project_dir / config.DIR_NO_AUDIO,
    ]
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


def _cleanup_partial_outputs(project_dir: Path, config: Config,
                              meta: ClipMetadata, rel_parent: Path, logger):
    """Remove partially written output files after a failed transcode."""
    audio_dirs = [
        project_dir / config.DIR_AUDIO,
        project_dir / config.DIR_NO_AUDIO,
    ]
    output_subdirs = [config.DIR_PROXIES, config.DIR_MASTERS, config.DIR_EXPORTS]
    
    stem = Path(meta.filename).stem
    
    for audio_dir in audio_dirs:
        for subdir in output_subdirs:
            out_dir = audio_dir / subdir / rel_parent
            if not out_dir.exists():
                continue
            for f in out_dir.iterdir():
                if f.is_file() and f.stem.startswith(stem):
                    logger.warning("Removing partial output: %s", f)
                    try:
                        f.unlink()
                    except OSError as e:
                        logger.error("Failed to remove %s: %s", f, e)


# ── Verify Command ────────────────────────────────────────────────

@cli.command()
@click.argument("project_path", type=click.Path(exists=True, file_okay=False))
def verify(project_path):
    """Verify output file integrity against the run manifest.

    Re-computes SHA-256 checksums for every output file and compares
    them to the stored values in the manifest.
    """
    project_dir = Path(project_path).resolve()
    manifest = RunManifest.load_latest(project_dir)

    if not manifest:
        console.print("[red]No manifest found in this project.[/red]")
        return

    console.print(f"[bold]Verifying run {manifest.run_id}…[/bold]")
    console.print(f"Status: {manifest.data.status.value} | Mode: {manifest.data.mode}")

    with console.status("[bold]Computing checksums…[/bold]"):
        report = manifest.verify_outputs(project_dir)

    # Results table
    if report["all_verified"]:
        console.print(
            f"\n[bold green]✓ All {report['passed']} output files verified[/bold green]"
        )
    else:
        console.print(f"\n[bold red]✗ Verification failed[/bold red]")
        console.print(
            f"  Passed: {report['passed']} | Failed: {report['failed']} | Missing: {report['missing']}"
        )
        if report["mismatches"]:
            table = Table(title="Mismatches", show_lines=False)
            table.add_column("File", style="red")
            table.add_column("Error")
            for m in report["mismatches"]:
                table.add_row(m["file"], m["error"])
            console.print(table)


# ── Cleanup Command ───────────────────────────────────────────────

@cli.command()
@click.argument("project_path", type=click.Path(exists=True, file_okay=False))
@click.option("--force", is_flag=True, help="Skip confirmation prompt")
def cleanup(project_path, force):
    """Safely delete source files after verifying all outputs.

    This is IRREVERSIBLE. Runs full SHA-256 verification before
    deleting any source files from 01_ORIGINALS/.
    """
    project_dir = Path(project_path).resolve()
    manifest = RunManifest.load_latest(project_dir)

    if not manifest:
        console.print("[red]No manifest found in this project.[/red]")
        return

    console.print(f"[bold]Checking run {manifest.run_id}…[/bold]")

    # Step 1: verify outputs
    console.print("Step 1/2: Verifying output checksums…")
    with console.status("[bold]Computing checksums…[/bold]"):
        report = manifest.verify_outputs(project_dir)

    if not report["all_verified"]:
        console.print("[bold red]✗ Verification failed — cleanup aborted[/bold red]")
        console.print(f"  {report['failed']} files failed, {report['missing']} missing")
        return

    console.print(f"[green]✓ All {report['passed']} outputs verified[/green]")

    # Step 2: safety check
    safe, reason = manifest.is_safe_to_clean(project_dir)
    if not safe:
        console.print(f"[bold red]✗ Not safe to clean: {reason}[/bold red]")
        return

    # Count files to delete
    originals_dir = project_dir / "01_ORIGINALS"
    files_to_delete = []
    if originals_dir.exists():
        for f in originals_dir.rglob("*"):
            if f.is_file():
                files_to_delete.append(f)

    if not files_to_delete:
        console.print("[yellow]No source files to clean up.[/yellow]")
        return

    total_size = sum(f.stat().st_size for f in files_to_delete)
    size_gb = total_size / (1024 ** 3)

    console.print(f"\nStep 2/2: Will delete [bold red]{len(files_to_delete)} files[/bold red] ({size_gb:.2f} GB)")

    if not force:
        if not click.confirm("Are you sure? This is IRREVERSIBLE"):
            console.print("[yellow]Cleanup cancelled.[/yellow]")
            return

    # Delete
    deleted = 0
    for f in files_to_delete:
        try:
            f.unlink()
            deleted += 1
        except OSError as e:
            console.print(f"[red]Failed to delete {f.name}: {e}[/red]")

    # Remove empty directories
    if originals_dir.exists():
        for d in sorted(originals_dir.rglob("*"), reverse=True):
            if d.is_dir() and not any(d.iterdir()):
                d.rmdir()

    console.print(f"[bold green]✓ Cleaned up {deleted} source files ({size_gb:.2f} GB freed)[/bold green]")


# ── History Command ───────────────────────────────────────────────

@cli.command()
@click.argument("project_path", type=click.Path(exists=True, file_okay=False))
def history(project_path):
    """Show processing run history for a project."""
    project_dir = Path(project_path).resolve()
    runs = RunManifest.list_runs(project_dir)

    if not runs:
        console.print("[yellow]No processing runs found.[/yellow]")
        return

    table = Table(title=f"Run History — {project_dir.name}", show_lines=False)
    table.add_column("Run ID", style="cyan")
    table.add_column("Status")
    table.add_column("Mode", justify="center")
    table.add_column("Files", justify="center")
    table.add_column("Started", style="dim")

    for run in runs:
        status = run["status"]
        if status == "COMPLETED":
            status_str = f"[green]{status}[/green]"
        elif status == "INTERRUPTED":
            status_str = f"[yellow]{status}[/yellow]"
        else:
            status_str = f"[red]{status}[/red]"

        files_str = f"{run['completed']}/{run['total']}"
        if run["failed"] > 0:
            files_str += f" [red]({run['failed']} failed)[/red]"

        table.add_row(
            run["run_id"],
            status_str,
            run["mode"],
            files_str,
            run.get("started_at", "—"),
        )

    console.print(table)


def main():
    cli()

if __name__ == "__main__":
    main()
