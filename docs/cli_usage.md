# CLI Usage

The DFVG Command Line Interface (CLI) provides a powerful way to interact with the transcoding engine, suitable for automation and advanced workflows.

## Basic Syntax

```bash
dfvg process [OPTIONS] [PATH]
```

- `PATH`: The directory containing the footage to process. Defaults to the current directory if not specified.

## Options

- `--mode [A|B]`: Select processing mode.
    - `A`: Compact (H.265 proxies only)
    - `B`: ProRes 422 HQ (High Quality intermediate + H.265 proxy)
    - Default: `A`

- `--output [PATH]`: Specify a custom output directory. If not provided, output will be saved alongside the original footage in a `proxies` or `transcoded` subdirectory.

- `--threads [N]`: Number of threads to use for transcoding. Defaults to `auto` (CPU count - 1).

- `--verbose`, `-v`: Enable verbose logging.

- `--help`: Show help message.

## Examples

### Process Current Directory (Compact Mode)

```bash
dfvg process
```

### Process Specific Folder (ProRes Mode)

```bash
dfvg process --mode B /Volumes/SD_CARD/DCIM/100MEDIA
```

### Specify Output Directory

```bash
dfvg process --output /Users/user/Movies/Project1 /Volumes/SD_CARD/DCIM/100MEDIA
```

## Advanced Usage

### Batch Processing

You can process multiple directories by passing them as arguments:

```bash
dfvg process /path/to/folder1 /path/to/folder2
```

### Monitoring Progress

The CLI displays a progress bar for each file being processed, showing the percentage complete, current file name, and estimated remaining time.
