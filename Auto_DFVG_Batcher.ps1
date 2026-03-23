<#
.SYNOPSIS
DFVG Automated Batch Processor for Massive Datasets

.DESCRIPTION
This script safely processes a massive dataset piece-by-piece by repeatedly:
1. Copying a safe-sized batch of files (e.g., 50GB) from a huge source drive to a local working folder.
2. Running DFVG's processing engine (creating proxies, masters).
3. Verifying the outputs mathematically.
4. "Cleaning up" (deleting) the original source files from the local working folder to free space.
5. Moving the successfully generated proxies & masters to a Cloud Sync folder.
6. Looping until the entire source drive has been processed.

This means you can process 2 Terabytes of video on a laptop that only has 100GB of free space, completely autonomously while you sleep.

.NOTES
- Make sure DFVG CLI is accessible (or modify $DfvgExePath).
- Set your 3 paths carefully before running.
#>

# ==============================================================================
# CONFIGURATION - CHANGE THESE BEFORE RUNNING
# ==============================================================================

# 1. The massive drive where your original raw media currently lives
$SourceDrive = "D:\MyMassiveSDCard"

# 2. Your fast local SSD where DFVG will do the actual processing work
$ProjectDir  = "C:\DFVG_Workspace"

# 3. Your Cloud Sync folder (e.g., Google Drive, Dropbox, OneDrive)
$CloudFolder = "Z:\CloudSync\DFVG_Uploads"

# How many Gigabytes of RAW files to copy locally per batch? 
# Keep this lower than your free C: drive space!
$BatchLimitGB = 50

# Path to the DFVG Command Line (if installed via the Windows Installer)
# If you are running from Python source code, you can change this to "python -m dfvg"
$DfvgExePath = "dfvg-api.exe"

# ==============================================================================

Write-Host "`n=======================================================" -ForegroundColor Cyan
Write-Host "   DFVG MASSIVE DATASET AUTOMATOR" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

# Ensure output directories exist
if (-not (Test-Path $ProjectDir\01_ORIGINALS)) { New-Item -Path $ProjectDir\01_ORIGINALS -ItemType Directory -Force | Out-Null }
if (-not (Test-Path $CloudFolder)) { New-Item -Path $CloudFolder -ItemType Directory -Force | Out-Null }

$ValidExtensions = @(".mp4", ".mov", ".mkv", ".mxf")
$BatchLimitBytes = $BatchLimitGB * 1GB

# We keep a simple log to remember which files from the MASSIVE drive we've already copied
$HistoryLog = "$ProjectDir\batch_history.txt"
if (-not (Test-Path $HistoryLog)) { New-Item -Path $HistoryLog -ItemType File | Out-Null }

$CopiedFilesSet = Get-Content -Path $HistoryLog -ErrorAction SilentlyContinue

while ($true) {
    Write-Host "`n[1] Scanning Source Drive for unprocessed files..." -ForegroundColor Yellow
    
    # Refresh history
    $CopiedFilesSet = Get-Content -Path $HistoryLog -ErrorAction SilentlyContinue
    if ($null -eq $CopiedFilesSet) { $CopiedFilesSet = @() }

    # Find raw video files not yet copied
    $RawFiles = Get-ChildItem -Path $SourceDrive -Recurse -File | Where-Object {
        ($ValidExtensions -contains $_.Extension.ToLower()) -and ($CopiedFilesSet -notcontains $_.FullName)
    }

    if ($RawFiles.Count -eq 0) {
        Write-Host "`n[SUCCESS] No more unprocessed video files found on $SourceDrive. Dataset complete!" -ForegroundColor Green
        break
    }

    Write-Host "Found $($RawFiles.Count) remaining raw files. Building next batch..."

    # Step A: Copy up to BatchLimitGB
    $CurrentBatchBytes = 0
    $CopiedCount = 0

    foreach ($file in $RawFiles) {
        if (($CurrentBatchBytes + $file.Length) -gt $BatchLimitBytes) {
            Write-Host "Batch limit of ${BatchLimitGB}GB reached. Moving to processing phase."
            break
        }

        # Mirror directory structure in 01_ORIGINALS
        $RelativePath = $file.FullName.Substring($SourceDrive.Length)
        if ($RelativePath.StartsWith("\")) { $RelativePath = $RelativePath.Substring(1) }
        
        $DestinationFile = Join-Path -Path "$ProjectDir\01_ORIGINALS" -ChildPath $RelativePath
        $DestinationDir = Split-Path -Path $DestinationFile -Parent

        if (-not (Test-Path $DestinationDir)) { New-Item -Path $DestinationDir -ItemType Directory -Force | Out-Null }

        Write-Host "  Copying: $($file.Name)..."
        Copy-Item -Path $file.FullName -Destination $DestinationFile -Force

        # Log it so we don't copy it again next loop
        Add-Content -Path $HistoryLog -Value $file.FullName

        $CurrentBatchBytes += $file.Length
        $CopiedCount++
    }

    if ($CopiedCount -eq 0) {
        Write-Host "Could not copy any files (perhaps the first file is larger than the batch limit?). Aborting." -ForegroundColor Red
        break
    }

    $BatchGB = [math]::Round($CurrentBatchBytes / 1GB, 2)
    Write-Host "`n[2] Processing new batch containing $CopiedCount files (${BatchGB}GB)..." -ForegroundColor Yellow

    # Step B: DFVG Process
    # Ensure current working directory is safe
    Push-Location $ProjectDir
    
    Write-Host "Running DFVG Engine..." -ForegroundColor Cyan
    & $DfvgExePath process $ProjectDir --mode FULL
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "DFVG Processing failed! Waiting 30s before trying to continue..." -ForegroundColor Red
        Start-Sleep -Seconds 30
    }

    # Step C: DFVG Verify
    Write-Host "`n[3] Verifying Outputs..." -ForegroundColor Yellow
    & $DfvgExePath verify $ProjectDir

    # Step D: DFVG Cleanup (Deletes exactly what was verified from 01_ORIGINALS)
    Write-Host "`n[4] Freeing Local Disk Space (Deleting Originals)..." -ForegroundColor Yellow
    & $DfvgExePath cleanup $ProjectDir --force

    Pop-Location

    # Step E: Move Proxies and Masters to Cloud
    Write-Host "`n[5] Moving processed files to Cloud Sync Folder ($CloudFolder)..." -ForegroundColor Yellow
    
    $OutputDirs = @("02_PROXIES", "03_GRADED_MASTERS", "05_PHOTOS")
    
    foreach ($dir in $OutputDirs) {
        $SourceDir = "$ProjectDir\$dir"
        if (Test-Path $SourceDir) {
            $DestDir = "$CloudFolder\$dir"
            if (-not (Test-Path $DestDir)) { New-Item -Path $DestDir -ItemType Directory -Force | Out-Null }
            
            # Copy all contents preserving structure
            Copy-Item -Path "$SourceDir\*" -Destination $DestDir -Recurse -Force
            
            # Delete local successfully copied ones to free space
            Remove-Item -Path "$SourceDir\*" -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Host "`nBatch complete! Waiting 10 seconds before starting the next batch..." -ForegroundColor Green
    Start-Sleep -Seconds 10
}

Write-Host "`n========== PIPELINE FINISHED ==========" -ForegroundColor Cyan
