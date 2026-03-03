import zipfile
import csv
from pathlib import Path
from typing import List
from .config import Config
from .detect import ClipMetadata

class Packager:
    def __init__(self, config: Config):
        self.config = config

    def create_metadata_csv(self, metadata_list: List[ClipMetadata], output_dir: Path):
        csv_path = output_dir / "METADATA.csv"
        with open(csv_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow([
                "Filename", "Resolution", "FPS", "Duration", 
                "Codec", "BitDepth", "Profile", "Camera"
            ])
            for m in metadata_list:
                writer.writerow([
                    m.filename, 
                    f"{m.width}x{m.height}", 
                    f"{m.fps:.2f}", 
                    f"{m.duration:.2f}s",
                    m.video_codec,
                    f"{m.bit_depth}-bit",
                    m.color_profile,
                    m.camera_model or "Unknown"
                ])

    def create_editor_pack(self, output_dir: Path):
        """
        Creates two editor packs:
        - EDITOR_PACK.zip         – proxies & previews WITH audio
        - EDITOR_PACK_NO_AUDIO.zip – proxies & previews WITHOUT audio

        Each zip includes:
        - 02_PROXIES/
        - 04_EXPORTS/1080p/ (Previews)
        - METADATA.csv
        """
        packs = [
            (output_dir / self.config.DIR_AUDIO, output_dir / "EDITOR_PACK.zip"),
            (output_dir / self.config.DIR_NO_AUDIO, output_dir / "EDITOR_PACK_NO_AUDIO.zip"),
        ]

        for source_root, zip_path in packs:
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                # Add Metadata (shared at project root)
                if (output_dir / "METADATA.csv").exists():
                    zf.write(output_dir / "METADATA.csv", "METADATA.csv")

                # Add Proxies & Previews from the audio-variant root
                for folder_name in [self.config.DIR_PROXIES, "04_EXPORTS/1080p"]:
                    folder_path = source_root / folder_name
                    if folder_path.exists():
                        for file in folder_path.rglob("*"):
                            if file.is_file() and not file.name.startswith("."):
                                # Archive name should be relative to the variant root
                                rel_path = file.relative_to(source_root)
                                zf.write(file, rel_path)

                # Add photos (same for both audio variants)
                photos_dir = output_dir / self.config.DIR_PHOTOS
                for sub in ("web", "thumb"):
                    photo_sub = photos_dir / sub
                    if photo_sub.exists():
                        for file in photo_sub.rglob("*"):
                            if file.is_file() and not file.name.startswith("."):
                                rel_path = file.relative_to(output_dir)
                                zf.write(file, str(rel_path))
