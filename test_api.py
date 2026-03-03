import time
import httpx
import sys
import os
from pathlib import Path

# Provide absolute path to test footage
TEST_DIR = str(Path.cwd().resolve())

def test_api():
    base_url = "http://127.0.0.1:8000"
    
    print(f"Testing API at {base_url}...", flush=True)
    
    # 1. Health
    try:
        r = httpx.get(f"{base_url}/health", timeout=10.0)
        print(f"Health: {r.status_code} {r.json()}", flush=True)
        if r.status_code != 200: return False
    except Exception as e:
        print(f"Failed to connect: {e}", flush=True)
        return False

    # 2. Scan
    print(f"Scanning {TEST_DIR}...", flush=True)
    r = httpx.post(f"{base_url}/scan", params={"path": TEST_DIR}, timeout=120.0)
    if r.status_code != 200:
        print(f"Scan failed: {r.text}", flush=True)
        return False
    data = r.json()
    print(f"Scan found {len(data['clips'])} clips.", flush=True)
    
    # 3. Job Start 
    print("Starting Job...", flush=True)
    r = httpx.post(f"{base_url}/jobs", json={"input_path": TEST_DIR, "mode": "A"}, timeout=10.0)
    if r.status_code != 200:
        print(f"Job start failed: {r.text}")
        return False
        
    job_id = r.json()["job_id"]
    print(f"Job started: {job_id}")
    
    # Poll
    for _ in range(5):
        time.sleep(1)
        r = httpx.get(f"{base_url}/jobs/{job_id}")
        status = r.json()
        print(f"Job Status: {status['status']} | Progress: {status['progress']*100:.1f}% | Msg: {status['message']}")
        if status['status'] in ["completed", "failed"]:
            break
            
    return True

if __name__ == "__main__":
    if test_api():
        sys.exit(0)
    else:
        sys.exit(1)
