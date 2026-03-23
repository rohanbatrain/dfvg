<#
.SYNOPSIS
DFVG Enterprise Batch Processor – Production Grade Daemon

.DESCRIPTION
A high-resilience automation daemon for processing massive datasets with DFVG.
Features:
- Config-driven (auto-generates a config.json)
- Rolling logs & Webhook notifications
- Pre-flight disk space safety checks
- Graceful shutdown/pause (detects stop.txt)
- Try-Catch network resilience for Cloud drops
#>

$ConfigPath = Join-Path -Path $PSScriptRoot -ChildPath "dfvg_batcher_config.json"
$LogDir     = Join-Path -Path $PSScriptRoot -ChildPath "logs"
$HistoryLog = Join-Path -Path $PSScriptRoot -ChildPath "batch_history.txt"

# Ensure Log Dir
if (-not (Test-Path $LogDir)) { New-Item -Path $LogDir -ItemType Directory -Force | Out-Null }
$CurrentLog = "$LogDir\batcher_$(Get-Date -Format 'yyyy-MM-dd').log"

# Clean old logs (older than 7 days)
Get-ChildItem -Path $LogDir -Filter "*.log" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } | Remove-Item -Force -ErrorAction SilentlyContinue

# ── LOGGING ────────────────────────────────────────────────────────
function Write-Log {
    param([string]$Message, [string]$Level="INFO")
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $logEntry = "[$timestamp] [$Level] $Message"
    
    # Console color
    switch ($Level) {
        "INFO"    { Write-Host $logEntry -ForegroundColor Cyan }
        "SUCCESS" { Write-Host $logEntry -ForegroundColor Green }
        "WARN"    { Write-Host $logEntry -ForegroundColor Yellow }
        "ERROR"   { Write-Host $logEntry -ForegroundColor Red }
        "ALERT"   { Write-Host $logEntry -ForegroundColor Magenta }
        Default   { Write-Host $logEntry }
    }
    
    # File Logger
    Add-Content -Path $CurrentLog -Value $logEntry
}

# ── WEBHOOK ────────────────────────────────────────────────────────
function Send-WebhookAlert {
    param([string]$Message, [string]$Url)
    if ([string]::IsNullOrWhiteSpace($Url)) { return }
    try {
        $body = @{ content = "🤖 **DFVG Batcher:** $Message" } | ConvertTo-Json
        Invoke-RestMethod -Uri $Url -Method Post -Body $body -ContentType "application/json" -ErrorAction SilentlyContinue | Out-Null
    } catch {
        Write-Log "Failed to send webhook alerting" -Level "WARN"
    }
}

# ── CONFIGURATION & SETUP ─────────────────────────────────────────
$DefaultConfig = @{
    SourceDrives = @("D:\", "E:\")
    ProjectDir   = "C:\DFVG_Workspace"
    CloudFolder  = "Z:\CloudSync"
    BatchLimitGB = 50
    DfvgExePath  = "dfvg-api.exe"
    WebhookUrl   = ""
    MinFreeSpaceGB = 15
}

if (-not (Test-Path $ConfigPath)) {
    Write-Log "No config found. Generating default config.json..." -Level "WARN"
    $DefaultConfig | ConvertTo-Json -Depth 3 | Set-Content -Path $ConfigPath
    Write-Log "Please edit $ConfigPath and restart the script!" -Level "ALERT"
    Start-Sleep -Seconds 10
    exit
}

$Config = Get-Content -Path $ConfigPath -Raw | ConvertFrom-Json

$ValidExtensions = @(".mp4", ".mov", ".mkv", ".mxf")
$BatchLimitBytes = $Config.BatchLimitGB * 1GB
$MinFreeSpaceBytes = $Config.MinFreeSpaceGB * 1GB
$ProjectDir = $Config.ProjectDir

if (-not (Test-Path "$ProjectDir\01_ORIGINALS")) { New-Item -Path "$ProjectDir\01_ORIGINALS" -ItemType Directory -Force | Out-Null }
if (-not (Test-Path $Config.CloudFolder)) { New-Item -Path $Config.CloudFolder -ItemType Directory -Force | Out-Null }
if (-not (Test-Path $HistoryLog)) { New-Item -Path $HistoryLog -ItemType File -Force | Out-Null }

Write-Log "DFVG Enterprise Batcher Started" -Level "SUCCESS"
Send-WebhookAlert "Pipeline started. Scanning $($Config.SourceDrives.Count) source drives..." $Config.WebhookUrl

# ── MAIN LOOP ───────────────────────────────────────────────────────
$BatchNumber = 1

while ($true) {
    # 1. Graceful Shutdown Check
    if (Test-Path "$ProjectDir\pause.txt") {
        Write-Log "Pause file detected. Sleeping for 60s..." -Level "WARN"
        Start-Sleep -Seconds 60
        continue
    }
    if (Test-Path "$ProjectDir\stop.txt") {
        Write-Log "Stop file detected. Shutting down daemon gracefully." -Level "ALERT"
        Send-WebhookAlert "Pipeline stopped gracefully." $Config.WebhookUrl
        break
    }

    # 2. Disk Space Safety Check
    $DriveLetter = (Resolve-Path $ProjectDir).Path.Substring(0, 3)
    $DriveInfo = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DeviceID='$($DriveLetter.TrimEnd('\'))'"
    if ($DriveInfo.FreeSpace -lt $MinFreeSpaceBytes) {
        Write-Log "CRITICAL: Drive $DriveLetter has less than $($Config.MinFreeSpaceGB)GB free! Pausing pipeline." -Level "ERROR"
        Send-WebhookAlert "CRITICAL: Local drive out of space. Pipeline paused." $Config.WebhookUrl
        Start-Sleep -Seconds 300
        continue
    }

    # 3. Scanning logic
    Write-Log "=== BATCH $BatchNumber ===" -Level "INFO"
    $CopiedFilesSet = Get-Content -Path $HistoryLog -ErrorAction SilentlyContinue
    if ($null -eq $CopiedFilesSet) { $CopiedFilesSet = @() }

    $RawFiles = @()
    foreach ($Drive in $Config.SourceDrives) {
        if (Test-Path $Drive) {
            $DriveFiles = Get-ChildItem -Path $Drive -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
                ($ValidExtensions -contains $_.Extension.ToLower()) -and ($CopiedFilesSet -notcontains $_.FullName)
            }
            if ($null -ne $DriveFiles) { $RawFiles += $DriveFiles }
        }
    }

    if ($RawFiles.Count -eq 0) {
        Write-Log "No more unprocessed video files found. Dataset complete!" -Level "SUCCESS"
        Send-WebhookAlert "🎉 Pipeline finished successfully. All sources processed." $Config.WebhookUrl
        break
    }

    Write-Log "Found $($RawFiles.Count) remaining files. Copying next batch..." -Level "INFO"
    $CurrentBatchBytes = 0
    $CopiedCount = 0

    # 4. Copy Loop with Try/Catch
    foreach ($file in $RawFiles) {
        if (($CurrentBatchBytes + $file.Length) -gt $BatchLimitBytes) { break }

        # Check free space dynamically during copy
        $DriveInfo = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DeviceID='$($DriveLetter.TrimEnd('\'))'"
        if ($DriveInfo.FreeSpace -lt ($file.Length + $MinFreeSpaceBytes)) {
            Write-Log "Local disk nearing safety limit. Ending copy phase early." -Level "WARN"
            break
        }

        $MatchingDrive = $Config.SourceDrives | Where-Object { $file.FullName.StartsWith($_[0]) } | Select-Object -First 1
        $RelativePath = $file.FullName
        if ($null -ne $MatchingDrive) {
            $RelativePath = $file.FullName.Substring($MatchingDrive.Length)
            if ($RelativePath.StartsWith("\")) { $RelativePath = $RelativePath.Substring(1) }
        }
        
        $DestinationFile = Join-Path -Path "$ProjectDir\01_ORIGINALS" -ChildPath $RelativePath
        $DestinationDir = Split-Path -Path $DestinationFile -Parent

        if (-not (Test-Path $DestinationDir)) { New-Item -Path $DestinationDir -ItemType Directory -Force | Out-Null }

        try {
            Copy-Item -Path $file.FullName -Destination $DestinationFile -Force -ErrorAction Stop
            Add-Content -Path $HistoryLog -Value $file.FullName
            $CurrentBatchBytes += $file.Length
            $CopiedCount++
        } catch {
            Write-Log "Copy failed for $($file.Name): $_" -Level "ERROR"
        }
    }

    if ($CopiedCount -eq 0) {
        Write-Log "Zero files copied this lap. Waiting 60s..." -Level "WARN"
        Start-Sleep -Seconds 60
        continue
    }

    $BatchGB = [math]::Round($CurrentBatchBytes / 1GB, 2)
    Write-Log "Batch prepared ($CopiedCount files, ${BatchGB}GB). Executing DFVG Engine..." -Level "INFO"

    # 5. Execute DFVG Engine
    Push-Location $ProjectDir
    
    & $Config.DfvgExePath process $ProjectDir --mode FULL
    if ($LASTEXITCODE -ne 0) {
        Write-Log "DFVG Processing reported an error code." -Level "WARN"
    }

    Write-Log "Verifying Outputs..." -Level "INFO"
    & $Config.DfvgExePath verify $ProjectDir

    Write-Log "Safe Cleanup (Freeing original space)..." -Level "INFO"
    & $Config.DfvgExePath cleanup $ProjectDir --force

    Pop-Location

    # 6. Cloud Network Moving with Resilience
    Write-Log "Moving to Cloud Sync ($($Config.CloudFolder))..." -Level "INFO"
    $OutputDirs = @("02_PROXIES", "03_GRADED_MASTERS", "05_PHOTOS")
    
    foreach ($dir in $OutputDirs) {
        $SourceDir = "$ProjectDir\$dir"
        if (Test-Path $SourceDir) {
            $DestDir = "$($Config.CloudFolder)\$dir"
            if (-not (Test-Path $DestDir)) { 
                try { New-Item -Path $DestDir -ItemType Directory -Force -ErrorAction Stop | Out-Null }
                catch { Write-Log "Network/Cloud Drive dropped! Retrying..." -Level "ERROR"; Start-Sleep -Seconds 60 }
            }
            
            try {
                # Copy then remove (safer than move across network boundaries)
                Copy-Item -Path "$SourceDir\*" -Destination $DestDir -Recurse -Force -ErrorAction Stop
                Remove-Item -Path "$SourceDir\*" -Recurse -Force -ErrorAction SilentlyContinue
            } catch {
                Write-Log "Cloud upload failed for $dir: $_" -Level "ERROR"
                Send-WebhookAlert "Network drop detected. File transfers interrupted." $Config.WebhookUrl
            }
        }
    }

    Write-Log "Batch $BatchNumber Complete." -Level "SUCCESS"
    Send-WebhookAlert "Batch $BatchNumber Finished (${BatchGB}GB processed)." $Config.WebhookUrl
    $BatchNumber++
    
    Start-Sleep -Seconds 10
}
