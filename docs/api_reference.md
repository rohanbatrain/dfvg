# API Reference

The DFVG API provides endpoints for external applications to trigger transcoding, check job status, and manage the system.

## Ingestion Endpoints

### `POST /scan`

Scans a directory for DJI footage and returns a list of detected clips.

**Parameters:**

- `path`: The directory path to scan.

**Response:**

```json
{
  "clips": [
    {
      "filename": "DJI_001.MP4",
      "path": "/Volumes/SD_CARD/DCIM/100MEDIA/DJI_001.MP4",
      "size": 123456789,
      "metadata": {
        "width": 3840,
        "height": 2160,
        "fps": 60,
        "codec": "hevc"
      }
    }
  ]
}
```

### `POST /jobs`

Starts a transcoding job for a specific file.

**Parameters:**

- `path`: The path to the file to transcode.
- `mode`: The transcoding mode (`A` for Compact, `B` for ProRes).

**Response:**

```json
{
  "job_id": "12345",
  "status": "pending"
}
```

## Management Endpoints

### `GET /jobs/{id}`

Retrieves the status of a specific job.

**Parameters:**

- `id`: The ID of the job to retrieve.

**Response:**

```json
{
  "job_id": "12345",
  "status": "processing",
  "progress": 50,
  "current_file": "DJI_001.MP4",
  "message": "Transcoding..."
}
```

### `GET /system`

Retrieves system status information.

**Response:**

```json
{
  "cpu_usage": 10,
  "disk_usage": 50,
  "active_jobs": 1
}
```
