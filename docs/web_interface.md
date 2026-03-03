# Web Interface

The DFVG web interface provides a user-friendly way to manage your transcoding jobs from any device on your local network.

## Accessing the Interface

1. Start the web server:
   ```bash
   dfvg-web
   ```
2. Open your browser and navigate to `http://localhost:8000` (or the IP address displayed in the terminal if accessing from another device).

## Features

### Dashboard

### Dashboard

The dashboard is your main control center.
- **Source Directory**: Enter the path to your footage or use the "Browse" button (Electron only).
- **Scan**: Detects all compatible video files (MP4, MOV, MKV) and extracts metadata.
- **Stats**: View total duration, clip count, and color profile distribution.
- **Mode Selection**:
    - **Compact (H.265)**: Generates 720p proxies only. Best for quick drafts.
    - **ProRes (HQ)**: Generates ProRes 422 HQ intermediates + proxies. Best for editing.

### Job Management

- **Start New Job**: Drag and drop files or select a directory.
- **Pause/Resume/Cancel**: Control active jobs directly.
- **View Logs**: Access detailed logs for troubleshooting.

### Settings

- **Output Configuration**: Set default output directories and file naming conventions.
- **Transcoding Profiles**: Customize encoding settings (bitrate, resolution, codec).
- **Network Access**: Enable/disable remote access and configure port settings.

## Mobile Optimization

The web interface is fully responsive and optimized for mobile devices, allowing you to monitor jobs from your phone or tablet.
