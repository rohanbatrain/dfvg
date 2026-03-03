# Developer Guide

This guide provides information for developers who want to contribute to DFVG or understand its internal architecture.

## Architecture

DFVG is built with a modular architecture:

- **CLI**: The main entry point for command-line operations.
- **Transcoding Engine**: Core logic for handling file ingestion, transcoding, and proxy generation.
- **Web Interface**: A React-based frontend served by a FastAPI backend.
- **Mobile App**: A React Native app for remote monitoring and control.

### Directory Structure

- `dfvg/`: Core Python package.
    - `cli.py`: Command-line interface logic.
    - `transcode.py`: Transcoding logic.
    - `api/`: FastAPI backend.
- `frontend/`: React frontend code.
- `mobile/`: React Native mobile app code.
- `tests/`: Unit and integration tests.

## Contributing

We welcome contributions! Please follow these guidelines:

1. **Fork the repository** and create a feature branch.
2. **Write tests** for your changes.
3. **Run existing tests** to ensure no regressions.
4. **Submit a pull request** with a clear description of your changes.

## Running Tests

To run the test suite:

```bash
pytest
```

## Building Documentation

To build the documentation locally:

```bash
mkdocs build
```

To serve the documentation locally:

```bash
mkdocs serve
```
