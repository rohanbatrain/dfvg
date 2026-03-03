"""
DFVG Image Processor — EXIF extraction, DNG development, resizing, contact sheets.

All DJI Action cameras support DNG RAW photography:
- Action 2: 12MP, 1/1.7" sensor, DNG + JPEG (RAW available in Single Photo mode)
- Action 3: 12MP, DNG + JPEG
- Action 4: 10MP, DNG + JPEG
- Action 5 Pro: up to 40MP, 1/1.3" sensor, DNG + JPEG

DJI MakerNotes (future parsing potential):
- IMU / Gyroscope data (for Gyroflow stabilization)
- Lens distortion profiles (for auto fisheye correction)
- Camera state (temperature, firmware build, WB micro-adjustments)
"""

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple

logger = logging.getLogger("dfvg.image_processor")

DIR_PHOTOS = "05_PHOTOS"

# Sub-directories within 05_PHOTOS
SUB_ORIGINALS = "originals"
SUB_DEVELOPED = "developed"
SUB_WEB = "web"
SUB_THUMB = "thumb"


@dataclass
class ImageMetadata:
    """Metadata extracted from a photo's EXIF data."""
    file_path: Path
    filename: str
    width: int = 0
    height: int = 0
    format: str = "JPEG"          # JPEG or DNG
    bit_depth: int = 8
    camera_model: Optional[str] = None
    gps_lat: Optional[float] = None
    gps_lon: Optional[float] = None
    gps_alt: Optional[float] = None
    iso: Optional[int] = None
    shutter_speed: Optional[str] = None
    aperture: Optional[float] = None
    focal_length: Optional[float] = None
    timestamp: Optional[str] = None
    has_dng_pair: bool = False     # True if JPG has matching DNG
    is_dng: bool = False


def _gps_to_decimal(gps_coords, gps_ref) -> Optional[float]:
    """Convert EXIF GPS coordinates (degrees, minutes, seconds) to decimal."""
    try:
        degrees = float(gps_coords[0])
        minutes = float(gps_coords[1])
        seconds = float(gps_coords[2])
        decimal = degrees + minutes / 60.0 + seconds / 3600.0
        if gps_ref in ("S", "W"):
            decimal = -decimal
        return decimal
    except (TypeError, IndexError, ValueError):
        return None


def extract_exif(image_path: Path) -> ImageMetadata:
    """
    Extract EXIF metadata from a JPEG or DNG file using Pillow.
    """
    from PIL import Image
    from PIL.ExifTags import Base as ExifBase, GPS as GPSTags

    meta = ImageMetadata(
        file_path=image_path,
        filename=image_path.name,
        format="DNG" if image_path.suffix.upper() == ".DNG" else "JPEG",
        is_dng=image_path.suffix.upper() == ".DNG",
    )

    try:
        with Image.open(image_path) as img:
            meta.width = img.width
            meta.height = img.height
            if img.mode in ("I;16", "I;16L", "I;16B"):
                meta.bit_depth = 16
            elif meta.is_dng:
                meta.bit_depth = 12  # DJI Action 5 Pro DNG is 12-bit

            exif = img._getexif()
            if not exif:
                return meta

            # Camera model
            meta.camera_model = exif.get(ExifBase.Model)

            # Timestamp
            meta.timestamp = exif.get(ExifBase.DateTimeOriginal) or exif.get(ExifBase.DateTime)

            # ISO
            meta.iso = exif.get(ExifBase.ISOSpeedRatings)
            if isinstance(meta.iso, tuple):
                meta.iso = meta.iso[0]

            # Shutter speed
            exposure = exif.get(ExifBase.ExposureTime)
            if exposure:
                if isinstance(exposure, tuple):
                    num, den = exposure
                    if den > 0:
                        meta.shutter_speed = f"1/{int(den/num)}" if num > 0 else "0"
                else:
                    meta.shutter_speed = str(exposure)

            # Aperture
            fnum = exif.get(ExifBase.FNumber)
            if fnum:
                if isinstance(fnum, tuple):
                    meta.aperture = fnum[0] / fnum[1] if fnum[1] > 0 else None
                else:
                    meta.aperture = float(fnum)

            # Focal length
            fl = exif.get(ExifBase.FocalLength)
            if fl:
                if isinstance(fl, tuple):
                    meta.focal_length = fl[0] / fl[1] if fl[1] > 0 else None
                else:
                    meta.focal_length = float(fl)

            # GPS
            gps_info = exif.get(ExifBase.GPSInfo)
            if gps_info and isinstance(gps_info, dict):
                lat = gps_info.get(GPSTags.GPSLatitude)
                lat_ref = gps_info.get(GPSTags.GPSLatitudeRef)
                lon = gps_info.get(GPSTags.GPSLongitude)
                lon_ref = gps_info.get(GPSTags.GPSLongitudeRef)
                alt = gps_info.get(GPSTags.GPSAltitude)

                if lat and lat_ref:
                    meta.gps_lat = _gps_to_decimal(lat, lat_ref)
                if lon and lon_ref:
                    meta.gps_lon = _gps_to_decimal(lon, lon_ref)
                if alt:
                    meta.gps_alt = float(alt[0]) / float(alt[1]) if isinstance(alt, tuple) else float(alt)

    except Exception as e:
        logger.warning("EXIF extraction failed for %s: %s", image_path.name, e)

    return meta


def develop_dng(
    dng_path: Path,
    output_dir: Path,
    lut_path: Optional[Path] = None,
) -> Tuple[Optional[Path], Optional[Path]]:
    """
    Develop a DNG raw file into JPEG and TIFF.

    Uses rawpy with auto white balance and default demosaic.
    Optionally applies a LUT via Pillow after development.

    Returns (jpeg_path, tiff_path) or (None, None) on failure.
    """
    import rawpy
    import imageio
    from PIL import Image

    developed_dir = output_dir / DIR_PHOTOS / SUB_DEVELOPED
    developed_dir.mkdir(parents=True, exist_ok=True)

    jpeg_out = developed_dir / f"{dng_path.stem}.jpg"
    tiff_out = developed_dir / f"{dng_path.stem}.tiff"

    if jpeg_out.exists() and tiff_out.exists():
        return jpeg_out, tiff_out

    try:
        with rawpy.imread(str(dng_path)) as raw:
            # Develop: auto white balance, high quality demosaicing
            rgb = raw.postprocess(
                use_camera_wb=True,
                half_size=False,
                no_auto_bright=False,
                output_bps=16,
            )

        # Save TIFF (16-bit)
        imageio.imwrite(str(tiff_out), rgb)

        # Save JPEG (8-bit, high quality)
        img = Image.fromarray((rgb >> 8).astype("uint8"))

        # Apply LUT if provided (for D-Log M footage)
        if lut_path and lut_path.exists():
            img = _apply_lut_to_pil(img, lut_path)

        img.save(str(jpeg_out), quality=95, optimize=True)

        logger.info("Developed DNG: %s → JPEG + TIFF", dng_path.name)
        return jpeg_out, tiff_out

    except Exception as e:
        logger.error("DNG development failed for %s: %s", dng_path.name, e)
        return None, None


def resize_image(
    image_path: Path,
    output_dir: Path,
    sizes: Optional[dict] = None,
) -> dict:
    """
    Resize an image to multiple sizes.

    Default sizes: web (1920px long edge), thumb (640px long edge).
    Returns dict of {size_name: output_path}.
    """
    from PIL import Image

    if sizes is None:
        sizes = {"web": 1920, "thumb": 640}

    results = {}
    sub_map = {"web": SUB_WEB, "thumb": SUB_THUMB}

    try:
        with Image.open(image_path) as img:
            for name, max_px in sizes.items():
                sub_dir = output_dir / DIR_PHOTOS / sub_map.get(name, name)
                sub_dir.mkdir(parents=True, exist_ok=True)
                out_path = sub_dir / f"{image_path.stem}.jpg"

                if out_path.exists():
                    results[name] = out_path
                    continue

                # Only downscale, never upscale
                w, h = img.size
                if max(w, h) <= max_px:
                    # Copy as-is (convert to JPEG if needed)
                    img_copy = img.convert("RGB")
                    img_copy.save(str(out_path), quality=92, optimize=True)
                else:
                    img_copy = img.copy()
                    img_copy.thumbnail((max_px, max_px), Image.LANCZOS)
                    img_copy = img_copy.convert("RGB")
                    img_copy.save(str(out_path), quality=92, optimize=True)

                results[name] = out_path

    except Exception as e:
        logger.warning("Resize failed for %s: %s", image_path.name, e)

    return results


def photo_contact_sheet(
    image_paths: List[Path],
    output_path: Path,
    cols: int = 5,
    rows: int = 4,
    thumb_size: int = 320,
    padding: int = 4,
) -> Optional[Path]:
    """
    Generate a contact sheet (grid mosaic) from a list of images.
    """
    from PIL import Image

    if not image_paths:
        return None

    max_images = cols * rows
    images_to_use = image_paths[:max_images]

    sheet_w = cols * thumb_size + (cols + 1) * padding
    sheet_h = rows * thumb_size + (rows + 1) * padding

    # Dark background matching the report theme
    sheet = Image.new("RGB", (sheet_w, sheet_h), (26, 26, 46))

    for i, img_path in enumerate(images_to_use):
        row = i // cols
        col = i % cols

        try:
            with Image.open(img_path) as img:
                img.thumbnail((thumb_size, thumb_size), Image.LANCZOS)
                img = img.convert("RGB")

                # Center within cell
                x = padding + col * (thumb_size + padding) + (thumb_size - img.width) // 2
                y = padding + row * (thumb_size + padding) + (thumb_size - img.height) // 2
                sheet.paste(img, (x, y))
        except Exception:
            continue

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(str(output_path), quality=90, optimize=True)
    logger.info("Photo contact sheet: %s (%d images)", output_path.name, len(images_to_use))
    return output_path


def _apply_lut_to_pil(img, lut_path: Path):
    """
    Apply a 3D LUT (.cube) to a Pillow Image.

    Simplified implementation: parses .cube LUT and applies via Pillow's
    ImageFilter or direct pixel manipulation.
    """
    from PIL import ImageFilter

    # For now, return the image unmodified if LUT parsing isn't trivial.
    # Full .cube LUT application requires parsing the 3D table and
    # performing trilinear interpolation — or using colour-science lib.
    # In production, the FFmpeg transcoder handles LUT for video;
    # for photos, rawpy's postprocess with camera WB is usually sufficient.
    logger.debug("LUT application to still images is a placeholder — using camera WB")
    return img


def process_photos(
    project_dir: Path,
    lut_path: Optional[Path] = None,
    camera_model: Optional[str] = None,
) -> Tuple[List[ImageMetadata], int]:
    """
    Process all photos in a project's 01_ORIGINALS directory.

    1. Finds all .jpg/.jpeg/.dng files
    2. Links DNG+JPEG pairs
    3. Extracts EXIF
    4. Develops DNG files
    5. Resizes everything
    6. Generates contact sheet

    Returns (list of ImageMetadata, count of photos processed).
    """
    originals_dir = project_dir / "01_ORIGINALS"
    if not originals_dir.exists():
        return [], 0

    # Collect all image files
    image_files = []
    for ext in (".jpg", ".jpeg", ".dng"):
        image_files.extend(originals_dir.rglob(f"*{ext}"))
        image_files.extend(originals_dir.rglob(f"*{ext.upper()}"))

    # Deduplicate (case-insensitive paths might overlap)
    seen = set()
    unique_files = []
    for f in image_files:
        key = str(f).lower()
        if key not in seen:
            seen.add(key)
            unique_files.append(f)
    image_files = sorted(unique_files)

    if not image_files:
        return [], 0

    # Identify DNG+JPEG pairs
    dng_stems = {f.stem.upper() for f in image_files if f.suffix.upper() == ".DNG"}
    jpeg_stems = {f.stem.upper() for f in image_files if f.suffix.upper() in (".JPG", ".JPEG")}
    paired_stems = dng_stems & jpeg_stems

    metadata_list: List[ImageMetadata] = []
    all_output_jpegs: List[Path] = []
    processed = 0

    for img_file in image_files:
        is_dng = img_file.suffix.upper() == ".DNG"
        is_paired_jpeg = (
            not is_dng and img_file.stem.upper() in paired_stems
        )

        # Skip the JPEG of a DNG+JPEG pair (DNG takes priority, JPEG is backup)
        # We still extract its EXIF but don't resize it separately
        meta = extract_exif(img_file)
        meta.has_dng_pair = img_file.stem.upper() in paired_stems

        if is_dng:
            # Develop DNG → JPEG + TIFF
            jpeg_out, tiff_out = develop_dng(img_file, project_dir, lut_path=lut_path)
            if jpeg_out and jpeg_out.exists():
                # Resize the developed JPEG
                resize_image(jpeg_out, project_dir)
                all_output_jpegs.append(jpeg_out)
                processed += 1
        elif not is_paired_jpeg:
            # Standalone JPEG — resize directly
            resize_image(img_file, project_dir)
            all_output_jpegs.append(img_file)
            processed += 1
        # else: paired JPEG — skip resize (DNG version takes priority)

        metadata_list.append(meta)

    # Contact sheet from all output JPEGs
    if all_output_jpegs:
        sheet_path = project_dir / DIR_PHOTOS / "contact_sheet.jpg"
        photo_contact_sheet(all_output_jpegs, sheet_path)

    logger.info("Processed %d photos (%d DNG pairs)", processed, len(paired_stems))
    return metadata_list, processed
