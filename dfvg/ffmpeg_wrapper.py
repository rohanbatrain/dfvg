import subprocess
import threading
import logging
import time
import platform
import re
from pathlib import Path
from typing import Optional, Callable, List

logger = logging.getLogger("dfvg.ffmpeg")

class FFmpegError(RuntimeError):
    pass

class FFmpegExecutor:
    """
    Robust wrapper for FFmpeg subprocess execution with timeouts, 
    thread-safe progress parsing, and hardware acceleration detection.
    """
    
    def __init__(self, timeout: int = 3600):
        self.timeout = timeout
        self._hw_accel_cache: Optional[str] = None

    def get_hardware_acceleration_flag(self) -> Optional[List[str]]:
        """
        Detects available hardware acceleration.
        Returns FFmpeg input/output flags or None.
        """
        if self._hw_accel_cache:
            return self._hw_accel_cache.split() if self._hw_accel_cache else None

        system = platform.system()
        flags = None

        if system == "Darwin":
            # Check for VideoToolbox
            try:
                res = subprocess.run(
                    ["ffmpeg", "-encoders"], 
                    capture_output=True, text=True, timeout=5
                )
                if "h264_videotoolbox" in res.stdout:
                    flags = "-c:v h264_videotoolbox -allow_sw 1" 
                    # Note: we return encoding flags usually, but sometimes decoding input flags are needed
                    # For simple proxy gen, we usually just want HW encoding.
            except Exception:
                pass
        
        # Future: Add NVENC check for Linux/Windows
        # if system == "Linux": ...

        self._hw_accel_cache = flags
        return flags.split() if flags else None

    def run(
        self, 
        cmd: List[str], 
        duration: float, 
        progress_callback: Optional[Callable[[float], None]] = None
    ):
        """
        Executes FFmpeg command with progress tracking.
        """
        logger.info("Executing: %s", " ".join(cmd))
        
        start_time = time.time()
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True,
            bufsize=1  # Line buffered
        )

        # Thread to read stderr for progress without blocking
        error_lines = []
        
        def monitor_stderr():
            time_pattern = re.compile(r"time=(\d{2}):(\d{2}):(\d{2}\.\d{2})")
            for line in process.stderr:
                error_lines.append(line)
                if duration > 0 and progress_callback:
                    match = time_pattern.search(line)
                    if match:
                        h, m, s = map(float, match.groups())
                        current_seconds = h * 3600 + m * 60 + s
                        percent = min(1.0, current_seconds / duration)
                        try:
                            progress_callback(percent)
                        except Exception:
                            pass # User callback failed, don't crash

        stderr_thread = threading.Thread(target=monitor_stderr, daemon=True)
        stderr_thread.start()

        try:
            process.wait(timeout=self.timeout)
        except subprocess.TimeoutExpired:
            process.kill()
            stderr_thread.join(timeout=1)
            raise FFmpegError(f"FFmpeg timed out after {self.timeout}s")
        
        stderr_thread.join()

        if process.returncode != 0:
            error_msg = "".join(error_lines[-20:]) # Last 20 lines
            raise FFmpegError(f"FFmpeg failed (code {process.returncode}):\n{error_msg}")

        elapsed = time.time() - start_time
        logger.info("FFmpeg finished in %.2fs", elapsed)
