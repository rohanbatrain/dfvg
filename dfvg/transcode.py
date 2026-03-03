import shutil
from pathlib import Path
from .config import Config, TranscodeConfig
from .rules import ProcessingRule
from .detect import ClipMetadata
from .ffmpeg_wrapper import FFmpegExecutor, FFmpegError

class Transcoder:
    def __init__(self, config: Config):
        self.config = config
        self.executor = FFmpegExecutor()

    def transcode(self, meta: ClipMetadata, rule: ProcessingRule, output_dir: Path, progress_callback=None, rel_path: Path = None):
        """
        Main entry point to process a single clip based on rules.

        Generates output in two root sub-folders:
        - ``audio/``          – all variants with audio
        - ``without_audio/``  – all variants with audio stripped (``-an``)

        Args:
            rel_path: Optional relative sub-path (e.g. ``Day_1/Scene_A``) that is
                      inserted between the output category folder and the filename
                      so that deeply nested source structures are mirrored in every
                      output directory.
        """
        variants = []
        if "proxy" in rule.output_types: variants.append("proxy")
        if "preview" in rule.output_types: variants.append("preview")
        if "master" in rule.output_types: variants.append("master")
        if meta.width >= 3840: variants.append("2k")
            
        if not variants:
            return

        # Two passes: with audio and without audio
        audio_modes = [
            (self.config.DIR_AUDIO, False),      # with audio
            (self.config.DIR_NO_AUDIO, True),     # without audio
        ]

        total_steps = len(variants) * len(audio_modes)

        # sub-directory fragment that mirrors the source tree
        sub = rel_path if rel_path else Path()

        step = 0
        for audio_folder, strip_audio in audio_modes:
            root = output_dir / audio_folder

            for variant in variants:
                # Calculate base progress for this chunk
                base_prog = step / total_steps
                chunk_size = 1.0 / total_steps
                _step = step  # capture for closure

                def sub_callback(pct, _base=base_prog, _chunk=chunk_size):
                    if progress_callback:
                        progress_callback(_base + (pct * _chunk))

                if variant == "proxy":
                    self._run_ffmpeg(
                        meta.file_path,
                        root / self.config.DIR_PROXIES / sub / f"{meta.file_path.stem}_PROXY.mp4",
                        self.config.output_config.proxy,
                        meta.duration,
                        scale="1280:-2",
                        lut_path=rule.lut_path if rule.apply_lut else None,
                        normalization=rule.normalization,
                        strip_audio=strip_audio,
                        callback=sub_callback
                    )
                elif variant == "preview":
                    self._run_ffmpeg(
                        meta.file_path,
                        root / self.config.DIR_EXPORTS / "1080p" / sub / f"{meta.file_path.stem}_PREVIEW.mp4",
                        self.config.output_config.preview,
                        meta.duration,
                        scale="1920:-2",
                        lut_path=rule.lut_path if rule.apply_lut else None,
                        normalization=rule.normalization,
                        strip_audio=strip_audio,
                        callback=sub_callback
                    )
                elif variant == "master":
                    suffix = "_GRADED" if rule.apply_lut else "_NORMALIZED"
                    ext = 'mov' if 'prores' in self.config.output_config.master.video_codec else 'mp4'
                    dest_file = root / self.config.DIR_MASTERS / sub / f"{meta.file_path.stem}{suffix}.{ext}"
                    self._run_ffmpeg(
                        meta.file_path,
                        dest_file,
                        self.config.output_config.master,
                        meta.duration,
                        scale=None,
                        lut_path=rule.lut_path if rule.apply_lut else None,
                        normalization=rule.normalization,
                        strip_audio=strip_audio,
                        callback=sub_callback
                    )
                elif variant == "2k":
                     self._run_ffmpeg(
                        meta.file_path,
                        root / self.config.DIR_EXPORTS / "2K" / sub / f"{meta.file_path.stem}_2K.mp4",
                        self.config.output_config.preview, 
                        meta.duration,
                        scale="2560:-2", 
                        lut_path=rule.lut_path if rule.apply_lut else None,
                        normalization=rule.normalization,
                        strip_audio=strip_audio,
                        callback=sub_callback
                    )

                step += 1

    def _run_ffmpeg(
        self, 
        input_path: Path, 
        output_path: Path, 
        cfg: TranscodeConfig, 
        duration: float,
        scale: str = None, 
        lut_path: str = None,
        normalization: bool = False,
        strip_audio: bool = False,
        callback = None
    ):
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        cmd = ["ffmpeg", "-y", "-i", str(input_path)]
        
        # Filters
        filters = []
        if scale:
            filters.append(f"scale={scale}")
            
        if lut_path:
            filters.append(f"lut3d='{lut_path}'")
        elif normalization:
            filters.append("eq=contrast=1.1:saturation=1.1:brightness=-0.05")

        if filters:
            cmd.extend(["-vf", ",".join(filters)])
            
        # Codecs & Hardware Acceleration
        # Check if hardware acceleration is available for h264/hevc
        hw_flags = self.executor.get_hardware_acceleration_flag()
        
        # If available, use HW accel for H.264/HEVC encoding
        # This is a simplification. Real checking needs to match codec to encoder.
        # e.g. 'libx264' -> 'h264_videotoolbox'
        if hw_flags and (cfg.video_codec == "libx264" or cfg.video_codec == "libx265"):
            # Check platform specific map
            if "videotoolbox" in hw_flags[1]: # rudimentary check
                if cfg.video_codec == "libx264":
                     cmd.extend(["-c:v", "h264_videotoolbox", "-allow_sw", "1", "-b:v", "6000k"]) # approx bitrate
                elif cfg.video_codec == "libx265":
                     cmd.extend(["-c:v", "hevc_videotoolbox", "-allow_sw", "1", "-b:v", "4000k"])
            else:
                # Fallback to software config
                self._add_software_encoding_flags(cmd, cfg)
        else:
             self._add_software_encoding_flags(cmd, cfg)

        if strip_audio:
            cmd.append("-an")
        else:
            cmd.extend(["-c:a", cfg.audio_codec])
        # Pix_fmt often incompatible with HW accel unless strictly managed, omitting for HW if needed.
        # keeping simple: only applying pix_fmt if software encoding or if explicit
        if not hw_flags and cfg.pixel_format:
            cmd.extend(["-pix_fmt", cfg.pixel_format])
            
        cmd.append(str(output_path))
        
        self.executor.run(cmd, duration, callback)

    def _add_software_encoding_flags(self, cmd, cfg):
        cmd.extend(["-c:v", cfg.video_codec])
        if cfg.video_codec.startswith("libx26"):
            cmd.extend(["-preset", cfg.preset])
            if cfg.crf is not None:
                cmd.extend(["-crf", str(cfg.crf)])
        if "prores" in cfg.video_codec:
            cmd.extend(["-profile:v", cfg.preset])

