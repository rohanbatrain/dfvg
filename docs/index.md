# DFVG - DJI Footage Variant Generator

**DFVG** is a professional-grade transcoding and proxy generation tool designed specifically for DJI action cameras (Action 2, Action 3, Action 4, Action 5 Pro). It automates the ingestion, transcoding, and proxy generation workflow, ensuring your footage is ready for editing immediately.

## Key Features

- **Automated Ingestion**: Scans directories for DJI footage.
- **Transcoding**: Creates high-quality ProRes 422 HQ intermediates.
- **Proxy Generation**: Generates lightweight H.265 proxies for smooth editing.
- **Metadata Preservation**: Retains original timecodes and metadata.
- **Multi-Platform**:
    - **CLI**: Powerful command-line interface for scripting.
    - **Web UI**: Modern React-based dashboard for local network access.
    - **Desktop App**: Electron-based application for macOS.
    - **Mobile App**: React Native app for remote monitoring and control.
- **Network Serving**: Bind to `0.0.0.0` for LAN access and control via mobile app.

## Understanding Modes

DFVG offers three processing modes. Choose the one that fits your workflow:

### ⭐ Full Mode (Recommended)
**Best for:** Having everything ready in one pass.
- **ProRes HQ Masters:** Visually lossless intermediates for editing.
- **H.265 Proxies:** Small 720p files for mobile/laptop review.
- **1080p Previews:** Shareable H.264 exports.
- **2K Exports:** Auto-generated for 4K+ source footage.
- **Use Case:** You want to run DFVG once and be completely ready for editing, sharing, and archiving.

### Compact Mode (H.265)
**Best for:** Quick previewing, mobile transfer, and storage efficiency.
- **Proxies:** Generates small, high-efficiency H.265 proxies (720p).
- **Master:** Relinks to original source files.
- **Use Case:** You just shot a lot of footage and want to view it on your phone or laptop without filling up space.

### ProRes Mode (HQ)
**Best for:** Professional editing in DaVinci Resolve, Premiere Pro, or Final Cut.
- **Intermediates:** Transcodes source footage to **ProRes 422 HQ**.
- **Proxies:** Also generates H.265 proxies for quick reference.
- **Use Case:** You are starting a serious edit and want the best possible performance and color grading flexibility.

## Getting Started

### Installation

```bash
pip install dfvg
```

### Basic Usage (CLI)

```bash
dfvg process /path/to/footage
```

### Launch Web Interface

```bash
dfvg-web
```
