import pytest
import asyncio
import time
from unittest.mock import MagicMock, patch
from concurrent.futures import ThreadPoolExecutor

from dfvg.api.worker import JobManager, JobStatus
from dfvg.ffmpeg_wrapper import FFmpegExecutor, FFmpegError
from dfvg.api.discovery import DiscoveryService

# ── Test JobManager Concurrency ───────────────────────────────

def test_job_manager_concurrency():
    # Reset singleton
    JobManager._instance = None
    manager = JobManager()
    
    # Mock _process_job to simulate work
    with patch.object(manager, '_process_job') as mock_process:
        mock_process.side_effect = lambda job_id: time.sleep(0.1)
        
        # Submit 5 jobs
        job_ids = [manager.create_job(f"/tmp/test{i}", "A") for i in range(5)]
        
        # In a real ThreadPoolExecutor with max_workers=2, 
        # we can't easily check "active" count without private access,
        # but we can verify that jobs are accepted and futures created.
        
        assert len(manager._jobs) == 5
        assert all(manager._jobs[jid].future is not None for jid in job_ids)

        manager.shutdown()

# ── Test FFmpeg Executor Robustness ───────────────────────────

def test_ffmpeg_executor_timeout():
    executor = FFmpegExecutor(timeout=1)
    
    # Run a command that sleeps for 2 seconds (using python to simulate)
    cmd = ["python3", "-c", "import time; time.sleep(2)"]
    
    with pytest.raises(FFmpegError) as excinfo:
        executor.run(cmd, duration=0)
    
    assert "timed out" in str(excinfo.value)

def test_hardware_acceleration_detection():
    executor = FFmpegExecutor()
    # We can't guarantee HW, but we can check it doesn't crash
    flags = executor.get_hardware_acceleration_flag()
    print(f"Detected HW Flags: {flags}")
    # Should be None or a list
    assert flags is None or isinstance(flags, list)

# ── Test Discovery Service ────────────────────────────────────

def test_discovery_service_lifecycle():
    service = DiscoveryService(port=8000)
    service.start()
    assert service.running is True
    assert service.thread.is_alive()
    
    service.stop()
    assert service.running is False
