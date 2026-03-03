import os
from pathlib import Path
from pydantic import BaseModel
from typing import Optional

class TranscodeConfig(BaseModel):
    video_codec: str
    audio_codec: str
    pixel_format: str
    preset: str
    crf: Optional[int] = None
    bitrate: Optional[str] = None

class OutputConfig(BaseModel):
    proxy: TranscodeConfig
    preview: TranscodeConfig
    master: TranscodeConfig

# Option A: Compact/Compatible (Default)
OPTION_A = OutputConfig(
    proxy=TranscodeConfig(
        video_codec="libx264",
        audio_codec="aac",
        pixel_format="yuv420p",
        preset="fast",
        crf=23,
        bitrate=None
    ),
    preview=TranscodeConfig(
        video_codec="libx264",
        audio_codec="aac",
        pixel_format="yuv420p",
        preset="slow",
        crf=18,
        bitrate=None
    ),
    master=TranscodeConfig(
        video_codec="libx265",
        audio_codec="aac",
        pixel_format="yuv420p10le",
        preset="slow",
        crf=16,
        bitrate=None
    )
)

# Option B: Professional (ProRes)
OPTION_B = OutputConfig(
    proxy=TranscodeConfig(
        video_codec="prores_ks",
        audio_codec="pcm_s16le",
        pixel_format="yuv422p10le",
        preset="proxy", # profile 0
        crf=None,
        bitrate=None
    ),
    preview=TranscodeConfig(
        video_codec="libx264",  # Keep preview H.264 for easy sharing
        audio_codec="aac",
        pixel_format="yuv420p",
        preset="slow",
        crf=18,
        bitrate=None
    ),
    master=TranscodeConfig(
        video_codec="prores_ks",
        audio_codec="pcm_s16le",
        pixel_format="yuv422p10le",
        preset="hq", # profile 3
        crf=None,
        bitrate=None
    )
)

# Option FULL: Everything – H.265 proxies + ProRes HQ masters + H.264 previews
OPTION_FULL = OutputConfig(
    proxy=TranscodeConfig(
        video_codec="libx265",
        audio_codec="aac",
        pixel_format="yuv420p",
        preset="fast",
        crf=23,
        bitrate=None
    ),
    preview=TranscodeConfig(
        video_codec="libx264",
        audio_codec="aac",
        pixel_format="yuv420p",
        preset="slow",
        crf=18,
        bitrate=None
    ),
    master=TranscodeConfig(
        video_codec="prores_ks",
        audio_codec="pcm_s16le",
        pixel_format="yuv422p10le",
        preset="hq",  # ProRes 422 HQ
        crf=None,
        bitrate=None
    )
)

_MODE_MAP = {
    "A": OPTION_A,
    "B": OPTION_B,
    "FULL": OPTION_FULL,
}

class Config:
    def __init__(self, processing_mode: str = "FULL"):
        self.mode = processing_mode
        self.output_config = _MODE_MAP.get(processing_mode, OPTION_FULL)
        
        # Directories
        self.DIR_ORIGINALS = "01_ORIGINALS"
        self.DIR_PROXIES = "02_PROXIES"
        self.DIR_MASTERS = "03_GRADED_MASTERS"
        self.DIR_EXPORTS = "04_EXPORTS"
        self.DIR_PHOTOS = "05_PHOTOS"
        self.DIR_LOGS = "LOGS"
        self.DIR_AUDIO = "audio"
        self.DIR_NO_AUDIO = "without_audio"
        
        # LUT Path
        # Tries to find 'action5_dlogm_to_709.cube' in luts/ adjacent to package
        self.LUT_FILENAME = "action5_dlogm_to_709.cube"
        self.LUT_PATH = self._find_lut()

    def _find_lut(self) -> Optional[Path]:
        """
        Finds the LUT file, respecting OS-specific subfolders if present.
        """
        # Potential LUT filenames
        # The official download has: "DJI OSMO Action 5 Pro D-Log M to Rec.709 V1.cube"
        # We also look for our standardized name: "action5_dlogm_to_709.cube"
        
        candidates = [
            "action5_dlogm_to_709.cube",
            "DJI OSMO Action 5 Pro D-Log M to Rec.709 V1.cube"
        ]
        
        # Determine OS specific folder
        system =  os.uname().sysname if hasattr(os, 'uname') else 'Windows'
        if system == "Darwin":
            os_folder = "MACOS"
        elif system == "Windows" or system == "Nt":
             os_folder = "WINDOWS"
        else:
            os_folder = None # Linux or other
            
        search_paths = [
            Path.cwd() / "luts",
            Path(__file__).parent / "luts"
        ]
        
        for base_path in search_paths:
            if not base_path.exists():
                continue
                
            # 1. Check root of luts/ for standardized name
            for name in candidates:
                p = base_path / name
                if p.exists():
                    return p
            
            # 2. Check OS-specific subfolder
            if os_folder:
                for name in candidates:
                    p = base_path / os_folder / name
                    if p.exists():
                        return p
                        
        return None
