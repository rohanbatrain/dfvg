# DFVG - DJI Footage Variant Generator

DFVG is an automated video processing system designed to preserve original DJI footage, detect properties, and generate delivery variants.

## Features

- **Automated Ingestion**: Supports SD card, local disk, and cloud folders.
- **Original Preservation**: Immutable archive of original footage.
- **Smart Detection**: Detects resolution, FPS, codec, bit depth, and color profiles (D-Log M, D-Cinelike, Normal).
- **Variant Generation**: Creates Proxies (720p), Previews (1080p), and Graded Masters (Rec709).
- **Editor Delivery**: Bundles proxies and metadata into an editor-ready ZIP pack.

## Installation

### Prerequisites

- **FFmpeg**: Must be installed and accessible in your system path.
  - macOS: `brew install ffmpeg`
  - Windows: `winget install ffmpeg`
  - Linux: `sudo apt install ffmpeg`

### Install DFVG

```bash
pip install .
```

### Setup LUT (Important)

For correct D-Log M to Rec709 conversion on DJI Action 5 Pro footage, you must download the official LUT:

1.  Go to the [DJI Osmo Action 5 Pro Downloads Page](https://www.dji.com/osmo-action-5-pro/downloads).
2.  Download the **D-Log M to Rec.709 LUT**.
3.  Unzip the downloaded file.
4.  Copy the entire `MACOS` or `WINDOWS` folder (or the `.cube` files) into the `dfvg/luts/` directory. 

The system will automatically detect the correct LUT for your OS.

## Usage

```bash
dfvg process /path/to/footage
```

This will generate the following structure in the source directory (or a specified output directory):

- `01_ORIGINALS/`: Immutable archive of original footage.
- `02_PROXIES/`: Low-resolution H.264 proxies for editing.
- `03_GRADED_MASTERS/`: Color-corrected masters (ProRes/H.265).
- `04_EXPORTS/`: High-resolution deliverables.
- `EDITOR_PACK.zip`: Bundle containing proxies and metadata.
- `LOGS/`: Processing logs.
- `METADATA.csv`: Detailed clip metadata.

## Web Application

DFVG includes a modern web interface for managing your footage processing workflows.

### Starting the Server

To launch the web application and API, run:

```bash
python3 -m uvicorn dfvg.api:app --host 0.0.0.0 --port 8000
```

Then open your browser to: **http://localhost:8000**

### Features

- **Dashboard**: Scan directories to visualize footage metadata and detected color profiles.
- **Job Management**: Start processing jobs with a single click and monitor progress in real-time.
- **Mode Selection**: Choose between **Mode A** (Compact/H.265) and **Mode B** (Professional/ProRes).

## Development

### Backend (API)

```bash
# Install dependencies
pip install -e .

# Run dev server
python3 -m uvicorn dfvg.api:app --reload
```

### Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

To build the frontend for production:

```bash
cd frontend
npm run build
```

The API server automatically serves the built frontend from `frontend/dist`.
