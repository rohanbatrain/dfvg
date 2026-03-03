#!/usr/bin/env python3
"""
DFVG Standalone API Server — PyInstaller entry point.

This script is the single entry point that PyInstaller freezes into a
binary.  It boots the FastAPI app via uvicorn using the port supplied
by the Electron shell (or defaults to 8000 for manual use).
"""

import os
import sys

import uvicorn


def main():
    port = int(os.environ.get("DFVG_PORT", "8000"))
    host = os.environ.get("DFVG_HOST", "0.0.0.0")

    uvicorn.run(
        "dfvg.api.app:app",
        host=host,
        port=port,
        log_level="warning",
        # Workers=1 is fine; the ThreadPoolExecutor inside DFVG handles
        # parallelism for heavy transcoding jobs.
        workers=1,
    )


if __name__ == "__main__":
    main()
