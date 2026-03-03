# Installation

DFVG can be installed in several ways depending on your needs: as a Python library, a standalone executable, or as part of a development workflow.

## Prerequisites

- **Python**: 3.8 or higher
- **FFmpeg**: Required for transcoding. Ensure it is installed and available in your system PATH.

## Installation via pip

The easiest way to install DFVG is using pip:

```bash
pip install dfvg
```

## Installing FFmpeg

### macOS (Homebrew)
```bash
brew install ffmpeg
```

### Ubuntu/Debian
```bash
sudo apt update
sudo apt install ffmpeg
```

### Windows
Download the latest build from the [official FFmpeg website](https://ffmpeg.org/download.html) and add the `bin` folder to your system PATH.

## Development Installation

To install DFVG for development:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/example/dfvg.git
   cd dfvg
   ```

2. **Create a virtual environment (recommended):**
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -e .
   ```

4. **Install development dependencies (optional):**
   ```bash
   pip install -r requirements-dev.txt
   ```
