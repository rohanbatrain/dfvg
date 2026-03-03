# -*- mode: python ; coding: utf-8 -*-
"""
DFVG PyInstaller Spec File

Builds the Python FastAPI backend into a single-folder distribution.
The resulting `dfvg-api` binary can be spawned by Electron without
needing Python installed on the user's machine.

Usage:
    cd /path/to/DFVG
    source venv/bin/activate
    pyinstaller dfvg-api.spec

Output:  dist/dfvg-api/   (folder with the binary + dependencies)
"""

import os
from pathlib import Path

block_cipher = None

# Project root (where this .spec file lives)
PROJECT_ROOT = os.path.abspath('.')

# Collect LUT files if they exist
lut_datas = []
luts_dir = os.path.join(PROJECT_ROOT, 'dfvg', 'luts')
if os.path.isdir(luts_dir):
    for f in os.listdir(luts_dir):
        full = os.path.join(luts_dir, f)
        if os.path.isfile(full) or os.path.isdir(full):
            lut_datas.append((full, os.path.join('dfvg', 'luts', f)))

# Include the built frontend dist if it exists
frontend_datas = []
frontend_dist = os.path.join(PROJECT_ROOT, 'frontend', 'dist')
if os.path.isdir(frontend_dist):
    frontend_datas.append((frontend_dist, os.path.join('frontend', 'dist')))

a = Analysis(
    ['run_server.py'],
    pathex=[PROJECT_ROOT],
    binaries=[],
    datas=[
        *lut_datas,
        *frontend_datas,
    ],
    hiddenimports=[
        'dfvg',
        'dfvg.api',
        'dfvg.api.app',
        'dfvg.api.models',
        'dfvg.api.worker',
        'dfvg.cli',
        'dfvg.config',
        'dfvg.detect',
        'dfvg.ffmpeg_executor',
        'dfvg.pack',
        'dfvg.rules',
        'dfvg.transcode',
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        'fastapi',
        'starlette',
        'starlette.routing',
        'starlette.middleware',
        'starlette.middleware.cors',
        'anyio._backends._asyncio',
        'pydantic',
        'click',
        'rich',
        'yaml',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter', '_tkinter',
        'matplotlib',
        'numpy',
        'scipy',
        'PIL',
        'cv2',
        'IPython',
        'jupyter',
        'notebook',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='dfvg-api',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,   # Needed for stdout/stderr capture by Electron
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='dfvg-api',
)
