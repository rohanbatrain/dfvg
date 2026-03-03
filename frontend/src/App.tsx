import { useState, useEffect, useRef } from 'react'
import {
    FolderSearch, Play, Loader2, CheckCircle2, AlertCircle, FileVideo,
    HardDrive, FolderOpen, Clock, Clapperboard, Gauge, Film,
    ExternalLink, Sparkles, RotateCcw, X, Info, Smartphone, Upload,
    ShieldCheck, Trash2, Image, MapPin, Eye
} from 'lucide-react'
import QRCode from 'react-qr-code'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { Layout } from './components/Layout'
import { Sidebar } from './components/Sidebar'
import { Settings } from './components/Settings'

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs))
}

// ── Types ─────────────────────────────────────────────────────────
interface ClipInfo {
    filename: string; width: number; height: number; fps: number
    duration: number; video_codec: string; bit_depth: number
    camera_model?: string; color_profile: string
    scene_count?: number; motion_score?: number; avg_brightness?: number
    tags?: string[]; gps_summary?: {
        start_lat: number; start_lon: number; end_lat: number; end_lon: number
        total_distance_m: number; max_alt: number; avg_speed_kmh: number
    }
}
interface ScanResponse { path: string; clips: ClipInfo[] }
interface JobResponse {
    job_id: string; status: 'pending' | 'processing' | 'completed' | 'failed'
    progress: number; current_file?: string; message?: string
    manifest_path?: string
}
interface RunInfo {
    run_id: string; status: string; mode: string
    started_at?: string; completed_at?: string
    total: number; completed: number; failed: number
    manifest_path?: string
}
interface VerifyResult {
    total_outputs: number; passed: number; failed: number; missing: number
    all_verified: boolean
}
interface IngestFileInfo {
    source: string; destination: string; sidecar_count: number
    split_group?: string; skipped: boolean; skip_reason?: string
}
interface IngestPlan {
    total_found: number; to_copy: number; skipped: number
    sidecar_count: number; is_dji_source: boolean; files: IngestFileInfo[]
}
interface DetectedDrive {
    path: string; label: string; is_dji: boolean
    detected_at: string; video_count: number
}

declare global {
    interface Window {
        electronAPI?: {
            selectFolder: () => Promise<string | null>
            openFolder: (path: string) => void
            getApiPort: () => Promise<number>
            isElectron: boolean
        }
    }
}

const isElectron = !!window.electronAPI?.isElectron

function formatDuration(s: number) {
    const m = Math.floor(s / 60); const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
}

function formatRes(w: number, h: number) {
    if (w >= 3840) return '4K'
    if (w >= 2560) return '2.7K'
    if (w >= 1920) return '1080p'
    if (w >= 1280) return '720p'
    return `${w}x${h}`
}

export default function App() {
    // Navigation State
    const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'settings'>('dashboard')

    // Data State
    const [path, setPath] = useState('')
    const [isIngest, setIsIngest] = useState(false)
    const [ingestPath, setIngestPath] = useState('')
    const [isScanning, setIsScanning] = useState(false)
    const [scanResult, setScanResult] = useState<ScanResponse | null>(null)
    const [activeJob, setActiveJob] = useState<JobResponse | null>(null)
    const [mode, setMode] = useState<'A' | 'B'>('A')
    const [error, setError] = useState<string | null>(null)
    const [jobHistory, setJobHistory] = useState<JobResponse[]>([])
    const [runHistory, setRunHistory] = useState<RunInfo[]>([])
    const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)
    const [isVerifying, setIsVerifying] = useState(false)
    const [isCleaning, setIsCleaning] = useState(false)
    const [previewFrame, setPreviewFrame] = useState<string | null>(null)

    // Ingest State
    const [ingestPlan, setIngestPlan] = useState<IngestPlan | null>(null)
    const [detectedDrives, setDetectedDrives] = useState<DetectedDrive[]>([])
    const [isIngesting, setIsIngesting] = useState(false)
    const [ingestStep, setIngestStep] = useState<'select' | 'plan' | 'done'>('select')

    // UI State
    const [toast, setToast] = useState<string | null>(null)
    const [networkInfo, setNetworkInfo] = useState<{ ip: string; port: number; url: string } | null>(null)
    const [showNetworkModal, setShowNetworkModal] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const dragCounter = useRef(0)
    const pathInputRef = useRef<HTMLInputElement>(null)

    // — Toast helper
    function showToast(msg: string) {
        setToast(msg)
        setTimeout(() => setToast(null), 3000)
    }

    // — API base (handles Electron dynamic port)
    const [apiBase, setApiBase] = useState('/api')
    useEffect(() => {
        if (isElectron && window.electronAPI) {
            window.electronAPI.getApiPort().then(port => {
                setApiBase(`http://127.0.0.1:${port}`)
            })
        }
    }, [])

    // — Fetch functionality
    useEffect(() => {
        fetch(`${apiBase}/network-info`)
            .then(res => res.json())
            .then(data => setNetworkInfo(data))
            .catch(() => console.log('Network info unavailable'))
    }, [apiBase])

    // — Native folder picker (Electron) or manual input
    const handleBrowse = async (isSource: boolean = false) => {
        if (isElectron && window.electronAPI) {
            const selected = await window.electronAPI.selectFolder()
            if (selected) {
                if (isSource) setIngestPath(selected)
                else setPath(selected)
                setScanResult(null); setError(null)
            }
        } else {
            pathInputRef.current?.focus()
        }
    }

    // — Scan
    const handleScan = async () => {
        const scanTarget = isIngest ? ingestPath : path
        if (!scanTarget || (isIngest && !path)) {
            setError(isIngest && !path ? "Please select a Project Destination" : "Please select a directory")
            return
        }
        setIsScanning(true); setError(null); setScanResult(null)
        try {
            const res = await fetch(`${apiBase}/scan?path=${encodeURIComponent(scanTarget)}`, { method: 'POST' })
            if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || 'Scan failed') }
            const data = await res.json()
            setScanResult(data)
            if (data.clips.length === 0) showToast('No video or image files found in this directory')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Scan failed')
        } finally { setIsScanning(false) }
    }

    // — Fetch run history from manifest API
    const fetchRunHistory = async () => {
        if (!path) return
        try {
            const res = await fetch(`${apiBase}/runs?project_path=${encodeURIComponent(path)}`)
            if (res.ok) setRunHistory(await res.json())
        } catch (_) { /* ignore */ }
    }

    // — Verify outputs
    const handleVerify = async () => {
        if (!path) return; setIsVerifying(true); setVerifyResult(null)
        try {
            const res = await fetch(`${apiBase}/verify?project_path=${encodeURIComponent(path)}`, { method: 'POST' })
            if (res.ok) {
                const result = await res.json()
                setVerifyResult(result)
                showToast(result.all_verified ? 'All outputs verified ✓' : `Verification failed: ${result.failed} issues`)
            }
        } catch (err) { setError('Verification failed') }
        finally { setIsVerifying(false) }
    }

    // — Safe cleanup
    const handleCleanup = async () => {
        if (!path || !confirm('This will PERMANENTLY delete source files from 01_ORIGINALS/. Are you sure?')) return
        setIsCleaning(true)
        try {
            const res = await fetch(`${apiBase}/cleanup`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project_path: path })
            })
            const result = await res.json()
            if (result.safe) {
                showToast(`Cleaned ${result.files_deleted} files (${(result.bytes_freed / 1024 ** 3).toFixed(2)} GB freed)`)
            } else {
                setError(`Cleanup blocked: ${result.reason}`)
            }
        } catch (err) { setError('Cleanup failed') }
        finally { setIsCleaning(false) }
    }

    // — Start job
    const handleStartJob = async () => {
        if (!path || (isIngest && !ingestPath)) return; setError(null)
        try {
            const res = await fetch(`${apiBase}/jobs`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ input_path: path, mode, ingest_source: isIngest ? ingestPath : undefined })
            })
            if (!res.ok) throw new Error('Failed to start job')
            const job = await res.json()
            setActiveJob(job)
        } catch (err) { setError(err instanceof Error ? err.message : 'Failed to start job') }
    }

    // — Poll job
    useEffect(() => {
        if (!activeJob || ['completed', 'failed'].includes(activeJob.status)) return
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`${apiBase}/jobs/${activeJob.job_id}`)
                if (res.ok) {
                    const updated = await res.json()
                    setActiveJob(updated)
                    if (updated.status === 'completed') {
                        setJobHistory(prev => [updated, ...prev])
                        fetchRunHistory()
                        showToast('Processing complete! ✨')
                    }
                    if (updated.status === 'failed') {
                        setJobHistory(prev => [updated, ...prev])
                    }
                }
            } catch (_) { /* ignore polling errors */ }
        }, 800)
        return () => clearInterval(interval)
    }, [activeJob, apiBase])

    // — WebSocket preview during processing
    useEffect(() => {
        if (!activeJob || activeJob.status !== 'processing') { setPreviewFrame(null); return }
        const wsUrl = apiBase.replace(/^http/, 'ws') + '/ws/preview'
        let ws: WebSocket | null = null
        try {
            ws = new WebSocket(wsUrl)
            ws.onmessage = (ev) => {
                try {
                    const data = JSON.parse(ev.data)
                    if (data.frame) setPreviewFrame(data.frame)
                } catch { /* ignore */ }
            }
        } catch { /* WebSocket unavailable */ }
        return () => { ws?.close(); setPreviewFrame(null) }
    }, [activeJob?.status, apiBase])

    // — Load run history on tab switch
    useEffect(() => {
        if (activeTab === 'history') fetchRunHistory()
    }, [activeTab, path])

    // — Summary stats
    const totalDuration = scanResult?.clips.reduce((a, c) => a + c.duration, 0) ?? 0
    const profileCounts = scanResult?.clips.reduce((acc, c) => {
        acc[c.color_profile] = (acc[c.color_profile] || 0) + 1; return acc
    }, {} as Record<string, number>) ?? {}

    // — Drag & Drop handlers
    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation()
        dragCounter.current++
        if (e.dataTransfer.types.includes('Files')) setIsDragging(true)
    }
    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation()
        dragCounter.current--
        if (dragCounter.current === 0) setIsDragging(false)
    }
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation()
    }
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation()
        dragCounter.current = 0
        setIsDragging(false)

        const files = e.dataTransfer.files
        if (!files || files.length === 0) return

        const file = files[0] as any
        // Electron exposes the native path on File objects
        if (file.path) {
            const droppedPath = file.path
            if (isIngest) {
                setIngestPath(droppedPath)
            } else {
                setPath(droppedPath)
            }
            setScanResult(null); setError(null)
            showToast('Path loaded from drop — click Scan to continue')
        } else {
            // Web browsers don't expose full file paths for security
            showToast('Drop detected! Paste the full folder path manually — browsers restrict path access.')
        }
    }

    // ── Render Views ──────────────────────────────────────────────

    const renderDashboard = () => (
        <div className="space-y-8 animate-fade-in relative"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {/* ── Drop Overlay ────────────────────────────────────── */}
            {isDragging && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none animate-fade-in">
                    <div className="flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-blue-500 bg-blue-500/5 px-16 py-14 drop-zone-active">
                        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-500/10 border border-blue-500/30">
                            <Upload className="h-8 w-8 text-blue-400 animate-bounce" />
                        </div>
                        <h3 className="text-xl font-semibold text-blue-300">Drop your footage folder</h3>
                        <p className="text-sm text-zinc-400">Release to set the {isIngest ? 'ingest source' : 'workspace'} path</p>
                    </div>
                </div>
            )}
            {/* ── Source Input ────────────────────────────────────── */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-4">
                    <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Workspace Selection</label>
                    <button onClick={() => {
                        const next = !isIngest
                        setIsIngest(next); setScanResult(null); setIngestPlan(null); setIngestStep('select')
                        // Auto-detect DJI drives when toggling ingest on
                        if (next) {
                            fetch(`${apiBase}/drives`).then(r => r.json()).then(setDetectedDrives).catch(() => { })
                        }
                    }}
                        className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border",
                            isIngest ? "bg-blue-500/10 text-blue-400 border-blue-500/30" : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200"
                        )}>
                        <HardDrive className="h-3.5 w-3.5" />
                        Ingest from SD Card
                    </button>
                </div>

                <div className="space-y-4 mb-4">
                    {/* Project Destination */}
                    <div className="flex gap-3">
                        <div className="relative flex-1">
                            <FolderOpen className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-zinc-600" />
                            <input ref={pathInputRef} type="text" value={path}
                                onChange={(e) => { setPath(e.target.value); setScanResult(null) }}
                                onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                                placeholder={isIngest ? "Project Destination (e.g. /Desktop/My_Shoot)" : (isElectron ? "Click Browse or paste a path..." : "/Volumes/SD_CARD/DCIM")}
                                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-3 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-700 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                            />
                        </div>
                        {isElectron && (
                            <button onClick={() => handleBrowse(false)}
                                className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 px-5 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-800 hover:border-zinc-700 transition-all active:scale-95">
                                Browse
                            </button>
                        )}
                    </div>

                    {/* Ingest Source */}
                    {isIngest && (
                        <>
                            <div className="flex gap-3 animate-[fadeIn_0.2s_ease-out]">
                                <div className="relative flex-1">
                                    <HardDrive className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-zinc-600" />
                                    <input type="text" value={ingestPath}
                                        onChange={(e) => { setIngestPath(e.target.value); setIngestPlan(null); setIngestStep('select') }}
                                        onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                                        placeholder="SD Card Source (e.g. /Volumes/DJI_ACTION/DCIM)"
                                        className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-3 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-700 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                    />
                                </div>
                                {isElectron && (
                                    <button onClick={() => handleBrowse(true)}
                                        className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 px-5 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-800 hover:border-zinc-700 transition-all active:scale-95">
                                        Browse
                                    </button>
                                )}
                            </div>
                            {/* Detected DJI Drives */}
                            {detectedDrives.length > 0 && (
                                <div className="flex gap-2 animate-[fadeIn_0.2s_ease-out]">
                                    {detectedDrives.map(drive => (
                                        <button key={drive.path}
                                            onClick={() => { setIngestPath(drive.path); setIngestPlan(null); setIngestStep('select') }}
                                            className={cn("flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-all",
                                                ingestPath === drive.path
                                                    ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                                                    : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                                            )}>
                                            <HardDrive className="h-3.5 w-3.5" />
                                            <span className="font-medium">{drive.label}</span>
                                            {drive.is_dji && <span className="text-[9px] bg-orange-500/10 text-orange-400 px-1.5 py-0.5 rounded font-bold">DJI</span>}
                                            <span className="text-zinc-600">{drive.video_count} clips</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="flex justify-end gap-3">
                    {/* Ingest Plan button (when in ingest mode) */}
                    {isIngest && ingestPath && path && ingestStep === 'select' && (
                        <button onClick={async () => {
                            setError(null); setIsIngesting(true)
                            try {
                                const res = await fetch(`${apiBase}/ingest`, {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ source_path: ingestPath, project_path: path, mode: mode })
                                })
                                if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || 'Plan failed') }
                                const plan = await res.json()
                                setIngestPlan(plan); setIngestStep('plan')
                                if (plan.to_copy === 0) showToast('No new files to ingest')
                            } catch (err) { setError(err instanceof Error ? err.message : 'Ingest plan failed') }
                            finally { setIsIngesting(false) }
                        }} disabled={isIngesting}
                            className="flex items-center gap-2 rounded-xl bg-orange-600 px-6 py-3 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-orange-900/20">
                            {isIngesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
                            Plan Ingest
                        </button>
                    )}
                    <button onClick={handleScan} disabled={isScanning || !path || (isIngest && !ingestPath)}
                        className="flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shadow-lg shadow-blue-900/20">
                        {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSearch className="h-4 w-4" />}
                        Scan Footage
                    </button>
                </div>
                {error && (
                    <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-red-950/20 p-3.5 text-sm text-red-400 border border-red-900/30 animate-[fadeIn_0.2s_ease-out]">
                        <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                    </div>
                )}
            </section>

            {/* ── Ingest Plan Preview ──────────────────────────────── */}
            {ingestPlan && ingestStep === 'plan' && !activeJob && (
                <section className="rounded-2xl border border-orange-800/30 bg-orange-950/10 p-6 animate-[fadeIn_0.3s_ease-out]">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <HardDrive className="h-5 w-5 text-orange-400" />
                            <h2 className="text-lg font-semibold text-zinc-100">Ingest Plan</h2>
                            {ingestPlan.is_dji_source && (
                                <span className="text-[10px] bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded font-bold uppercase">DJI SD Card</span>
                            )}
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                            <span className="text-zinc-400">{ingestPlan.to_copy} to copy</span>
                            {ingestPlan.skipped > 0 && <span className="text-zinc-600">{ingestPlan.skipped} skipped</span>}
                            {ingestPlan.sidecar_count > 0 && <span className="text-zinc-500">{ingestPlan.sidecar_count} sidecars</span>}
                        </div>
                    </div>

                    {/* File list */}
                    <div className="max-h-48 overflow-y-auto mb-4 space-y-1 scrollbar-thin">
                        {ingestPlan.files.filter(f => !f.skipped).map((file, i) => (
                            <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded-lg text-xs bg-zinc-900/50">
                                <span className="text-zinc-300 font-mono truncate">{file.destination}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                    {file.sidecar_count > 0 && <span className="text-zinc-600">+{file.sidecar_count} sidecars</span>}
                                    {file.split_group && <span className="text-blue-400/60 text-[9px]">split: {file.split_group}</span>}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-end gap-3">
                        <button onClick={() => { setIngestPlan(null); setIngestStep('select') }}
                            className="px-5 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                            Cancel
                        </button>
                        <button onClick={async () => {
                            setIsIngesting(true); setError(null)
                            try {
                                const res = await fetch(`${apiBase}/ingest/execute`, {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ source_path: ingestPath, project_path: path, mode: mode, process_after: true })
                                })
                                if (!res.ok) throw new Error('Ingest execute failed')
                                const result = await res.json()
                                setIngestStep('done'); setIngestPlan(null)
                                showToast(`Ingested ${result.copied} files (${result.sidecars} sidecars)`)
                                if (result.job_id) {
                                    setActiveJob({ job_id: result.job_id, status: 'pending', progress: 0, message: 'Starting…' })
                                }
                            } catch (err) { setError(err instanceof Error ? err.message : 'Ingest failed') }
                            finally { setIsIngesting(false) }
                        }} disabled={isIngesting || ingestPlan.to_copy === 0}
                            className="flex items-center gap-2 rounded-xl bg-orange-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-orange-900/20">
                            {isIngesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                            Ingest & Process
                        </button>
                    </div>
                </section>
            )}

            {/* ── Scan Results ────────────────────────────────────── */}
            {scanResult && !activeJob && (
                <section className="animate-[fadeIn_0.3s_ease-out]">
                    {/* Summary Bar */}
                    <div className="mb-6 flex flex-wrap items-center gap-6 rounded-xl border border-zinc-800/50 bg-zinc-900/20 px-5 py-3">
                        <div className="flex items-center gap-2 text-sm">
                            <Clapperboard className="h-4 w-4 text-blue-400" />
                            <span className="text-zinc-500">Clips:</span>
                            <span className="font-semibold text-zinc-200">{scanResult.clips.length}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <Clock className="h-4 w-4 text-purple-400" />
                            <span className="text-zinc-500">Total:</span>
                            <span className="font-semibold text-zinc-200">{formatDuration(totalDuration)}</span>
                        </div>
                        {Object.entries(profileCounts).map(([profile, count]) => (
                            <div key={profile} className="flex items-center gap-1.5 text-sm">
                                <span className={cn("h-2 w-2 rounded-full",
                                    profile === 'D-Log M' ? 'bg-orange-400' :
                                        profile === 'D-Cinelike' ? 'bg-yellow-400' : 'bg-green-400'
                                )} />
                                <span className="text-zinc-500">{profile}:</span>
                                <span className="text-zinc-200 font-medium">{count}</span>
                            </div>
                        ))}
                    </div>

                    {/* Controls */}
                    <div className="mb-5 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-zinc-100">Detected Clips</h2>
                        <div className="flex items-center gap-3">
                            {/* Mode toggle */}
                            <div className="flex items-center rounded-xl bg-zinc-900 p-1 border border-zinc-800">
                                <button onClick={() => setMode('A')}
                                    className={cn("px-4 py-2 text-xs font-semibold rounded-lg transition-all",
                                        mode === 'A' ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300")}>
                                    <Gauge className="inline h-3 w-3 mr-1 -mt-0.5" /> Compact (H.265)
                                </button>
                                <button onClick={() => setMode('B')}
                                    className={cn("px-4 py-2 text-xs font-semibold rounded-lg transition-all",
                                        mode === 'B' ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300")}>
                                    <Film className="inline h-3 w-3 mr-1 -mt-0.5" /> ProRes (HQ)
                                </button>
                            </div>
                            {/* Start button */}
                            <button onClick={handleStartJob}
                                className="group flex items-center gap-2 rounded-xl bg-zinc-100 px-6 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-white transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-zinc-900/20">
                                <Play className="h-4 w-4 fill-current transition-transform group-hover:scale-110" />
                                Start Processing
                            </button>
                        </div>
                    </div>

                    {/* Clip Grid */}
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {scanResult.clips.map((clip, i) => (
                            <div key={i} className="group rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-4 transition-all hover:border-zinc-700 hover:bg-zinc-900/50 hover:shadow-lg hover:shadow-black/20"
                                style={{ animationDelay: `${i * 50}ms`, animation: 'fadeIn 0.3s ease-out both' }}>
                                <div className="mb-2.5 flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <FileVideo className="h-4 w-4 shrink-0 text-zinc-600 group-hover:text-blue-500 transition-colors" />
                                        <span className="font-medium text-zinc-200 truncate text-sm" title={clip.filename}>{clip.filename}</span>
                                    </div>
                                    <span className={cn("shrink-0 px-2 py-0.5 rounded-md text-[10px] uppercase font-bold tracking-wider",
                                        clip.color_profile === 'D-Log M' ? "bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20" :
                                            clip.color_profile === 'D-Cinelike' ? "bg-yellow-500/10 text-yellow-400 ring-1 ring-yellow-500/20" :
                                                "bg-green-500/10 text-green-400 ring-1 ring-green-500/20"
                                    )}>
                                        {clip.color_profile}
                                    </span>
                                </div>
                                <div className="grid grid-cols-3 gap-y-1.5 text-[11px]">
                                    <div className="text-zinc-500"><span className="text-zinc-300 font-medium">{formatRes(clip.width, clip.height)}</span></div>
                                    <div className="text-zinc-500"><span className="text-zinc-300 font-medium">{clip.fps}</span> fps</div>
                                    <div className="text-zinc-500"><span className="text-zinc-300 font-medium">{formatDuration(clip.duration)}</span></div>
                                    <div className="text-zinc-500 col-span-2"><span className="text-zinc-400">{clip.video_codec}</span> · {clip.bit_depth}-bit</div>
                                    {clip.camera_model && <div className="text-zinc-600 col-span-3 truncate">{clip.camera_model}</div>}
                                </div>
                                {/* Scene tags */}
                                {clip.tags && clip.tags.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {clip.tags.map(tag => (
                                            <span key={tag} className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {/* GPS indicator */}
                                {clip.gps_summary && (
                                    <div className="mt-1.5 flex items-center gap-1 text-[10px] text-zinc-500">
                                        <MapPin className="h-3 w-3 text-emerald-500" />
                                        <span>{clip.gps_summary.total_distance_m.toFixed(0)}m · {clip.gps_summary.avg_speed_kmh.toFixed(1)} km/h</span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* ── Active Job Progress ─────────────────────────────── */}
            {activeJob && (
                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-10 animate-[fadeIn_0.3s_ease-out]">
                    <div className="flex flex-col items-center gap-6">
                        {/* Status icon */}
                        <div className={cn("rounded-full p-4 relative",
                            activeJob.status === 'processing' ? "bg-blue-500/10" :
                                activeJob.status === 'completed' ? "bg-green-500/10" : "bg-red-500/10"
                        )}>
                            {activeJob.status === 'processing' && (
                                <>
                                    <div className="absolute inset-0 rounded-full border border-blue-500/30 animate-[spin_3s_linear_infinite]" />
                                    <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                                </>
                            )}
                            {activeJob.status === 'completed' && <CheckCircle2 className="h-10 w-10 text-green-500" />}
                            {activeJob.status === 'failed' && <AlertCircle className="h-10 w-10 text-red-500" />}
                            {activeJob.status === 'pending' && <Loader2 className="h-10 w-10 animate-spin text-zinc-400" />}
                        </div>

                        {/* Status text */}
                        <div className="text-center">
                            <h2 className="text-xl font-semibold text-zinc-100 capitalize">{activeJob.status === 'processing' ? 'Processing…' : activeJob.status}</h2>
                            {activeJob.current_file && <p className="mt-1 text-sm text-zinc-400 font-mono bg-zinc-950 px-2 py-1 rounded border border-zinc-800 inline-block">{activeJob.current_file}</p>}
                            <p className="mt-2 text-sm text-zinc-500">{activeJob.message}</p>
                        </div>

                        {/* Live Preview */}
                        {previewFrame && activeJob.status === 'processing' && (
                            <div className="w-full max-w-md rounded-xl overflow-hidden border border-zinc-800 bg-black">
                                <img src={`data:image/jpeg;base64,${previewFrame}`} alt="Live preview" className="w-full h-auto" />
                                <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-red-400 font-semibold uppercase">
                                    <Eye className="h-3 w-3" /> Live Preview
                                </div>
                            </div>
                        )}

                        {/* Progress */}
                        <div className="w-full max-w-lg">
                            <div className="relative h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                                <div className={cn("absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out",
                                    activeJob.status === 'failed' ? "bg-red-500" :
                                        activeJob.status === 'completed' ? "bg-green-500" :
                                            "bg-blue-500"
                                )} style={{ width: `${activeJob.progress * 100}%` }} />
                            </div>
                            <div className="mt-2 flex justify-between text-xs font-mono">
                                <span className="text-zinc-600">Progress</span>
                                <span className="text-zinc-300 font-semibold">{(activeJob.progress * 100).toFixed(0)}%</span>
                            </div>
                        </div>

                        {/* Actions */}
                        {activeJob.status === 'completed' && (
                            <div className="flex flex-col items-center gap-4 mt-4">
                                <div className="flex items-center gap-3">
                                    {isElectron && (
                                        <button onClick={() => window.electronAPI?.openFolder(path)}
                                            className="flex items-center gap-2 rounded-xl bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-700 transition-all border border-zinc-700">
                                            <ExternalLink className="h-4 w-4" /> Open Output
                                        </button>
                                    )}
                                    <button onClick={() => { setActiveJob(null); setScanResult(null) }}
                                        className="flex items-center gap-2 rounded-xl bg-zinc-100 px-5 py-2.5 text-sm font-medium text-zinc-900 hover:bg-white transition-all shadow-lg shadow-zinc-900/30">
                                        <RotateCcw className="h-4 w-4" /> Process Another
                                    </button>
                                </div>
                                {/* Verify & Cleanup */}
                                <div className="flex items-center gap-3">
                                    <button onClick={handleVerify} disabled={isVerifying}
                                        className="flex items-center gap-2 rounded-xl bg-emerald-600/10 border border-emerald-600/30 px-5 py-2.5 text-sm font-medium text-emerald-400 hover:bg-emerald-600/20 transition-all disabled:opacity-50">
                                        {isVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                                        Verify Outputs
                                    </button>
                                    <button onClick={handleCleanup} disabled={isCleaning || !verifyResult?.all_verified}
                                        className="flex items-center gap-2 rounded-xl bg-red-600/10 border border-red-600/30 px-5 py-2.5 text-sm font-medium text-red-400 hover:bg-red-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        title={!verifyResult?.all_verified ? 'Verify outputs first' : 'Delete source files'}>
                                        {isCleaning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                        Safe Cleanup
                                    </button>
                                </div>
                                {verifyResult && (
                                    <div className={cn("flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg",
                                        verifyResult.all_verified ? "bg-emerald-900/20 text-emerald-400 border border-emerald-800/30" : "bg-red-900/20 text-red-400 border border-red-800/30"
                                    )}>
                                        {verifyResult.all_verified ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                                        {verifyResult.passed}/{verifyResult.total_outputs} outputs verified
                                        {verifyResult.failed > 0 && ` · ${verifyResult.failed} failed`}
                                    </div>
                                )}
                            </div>
                        )}
                        {activeJob.status === 'failed' && (
                            <button onClick={() => { setActiveJob(null) }}
                                className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors">
                                <RotateCcw className="h-3.5 w-3.5" /> Try Again
                            </button>
                        )}
                    </div>
                </section>
            )}

            {/* ── Empty State ────────────────────────────────────── */}
            {!scanResult && !activeJob && !error && (
                <div className={cn(
                    "flex flex-col items-center justify-center py-20 text-center animate-fade-in border-2 border-dashed rounded-3xl transition-all select-none",
                    isDragging
                        ? "border-blue-500 bg-blue-500/5 drop-zone-active cursor-copy"
                        : "border-zinc-900 hover:border-zinc-800 hover:bg-zinc-900/20 cursor-default"
                )}>
                    <div className={cn(
                        "mb-6 flex h-20 w-20 items-center justify-center rounded-3xl shadow-xl transition-all",
                        isDragging
                            ? "bg-blue-500/10 border border-blue-500/30"
                            : "bg-zinc-900/80 border border-zinc-800"
                    )}>
                        {isDragging
                            ? <Upload className="h-8 w-8 text-blue-400 animate-bounce" />
                            : <FolderSearch className="h-8 w-8 text-zinc-500" />
                        }
                    </div>
                    <h3 className={cn("text-lg font-medium", isDragging ? "text-blue-300" : "text-zinc-300")}>
                        {isDragging ? 'Drop your footage folder here' : 'Select your footage directory'}
                    </h3>
                    <p className="mt-2 max-w-sm text-sm text-zinc-500">
                        {isDragging
                            ? `Release to set the ${isIngest ? 'ingest source' : 'workspace'} path`
                            : isElectron
                                ? 'Drag & drop a folder here, click Browse, or paste a path above.'
                                : 'Drag & drop a folder here, or paste the path above.'}
                    </p>
                    <div className="mt-8 flex items-center gap-6 text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">
                        <div className="flex items-center gap-1.5"><Info className="h-3 w-3" /> MP4 / MOV / MKV</div>
                        <div className="flex items-center gap-1.5"><Image className="h-3 w-3" /> JPG / DNG</div>
                        <div className="flex items-center gap-1.5"><Info className="h-3 w-3" /> DJI Action Series</div>
                    </div>
                </div>
            )}
        </div>
    )

    const renderHistory = () => (
        <div className="max-w-4xl space-y-6 animate-fade-in">
            <header>
                <h2 className="text-2xl font-bold text-white tracking-tight">Processing History</h2>
                <p className="text-zinc-500 text-sm mt-1">Review past runs from manifest history.</p>
            </header>

            {/* Manifest-based run history */}
            {runHistory.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Run Manifests</h3>
                    {runHistory.map((run) => (
                        <div key={run.run_id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4 hover:border-zinc-700 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className={cn("p-2 rounded-lg",
                                    run.status === 'COMPLETED' ? "bg-green-500/10 text-green-500" :
                                        run.status === 'FAILED' ? "bg-red-500/10 text-red-500" :
                                            run.status === 'INTERRUPTED' ? "bg-yellow-500/10 text-yellow-500" : "bg-blue-500/10 text-blue-500"
                                )}>
                                    {run.status === 'COMPLETED' ? <CheckCircle2 className="h-5 w-5" /> :
                                        run.status === 'FAILED' ? <AlertCircle className="h-5 w-5" /> :
                                            <Loader2 className="h-5 w-5" />}
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-zinc-200">Run {run.run_id.slice(0, 8)}</div>
                                    <div className="text-xs text-zinc-500">
                                        {run.mode} · {run.completed}/{run.total} completed
                                        {run.failed > 0 && <span className="text-red-400"> · {run.failed} failed</span>}
                                    </div>
                                    <div className="text-[10px] text-zinc-600 mt-0.5">{run.started_at}</div>
                                </div>
                            </div>
                            <span className={cn("text-xs uppercase font-bold tracking-wider px-2 py-1 rounded bg-zinc-950",
                                run.status === 'COMPLETED' ? 'text-green-500' :
                                    run.status === 'FAILED' ? 'text-red-500' :
                                        run.status === 'INTERRUPTED' ? 'text-yellow-500' : 'text-blue-500')}>
                                {run.status}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Session job history */}
            {jobHistory.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">This Session</h3>
                    {jobHistory.map((j, i) => (
                        <div key={i} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4 hover:border-zinc-700 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className={cn("p-2 rounded-lg",
                                    j.status === 'completed' ? "bg-green-500/10 text-green-500" :
                                        j.status === 'failed' ? "bg-red-500/10 text-red-500" : "bg-blue-500/10 text-blue-500"
                                )}>
                                    {j.status === 'completed' ? <CheckCircle2 className="h-5 w-5" /> :
                                        j.status === 'failed' ? <AlertCircle className="h-5 w-5" /> : <Loader2 className="h-5 w-5 animate-spin" />}
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-zinc-200">Job {j.job_id.slice(0, 8)}</div>
                                    <div className="text-xs text-zinc-500">{j.status === 'completed' ? 'Finished successfully' : j.message}</div>
                                </div>
                            </div>
                            <span className={cn("text-xs uppercase font-bold tracking-wider px-2 py-1 rounded bg-zinc-950",
                                j.status === 'completed' ? 'text-green-500' :
                                    j.status === 'failed' ? 'text-red-500' : 'text-blue-500')}>
                                {j.status}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {runHistory.length === 0 && jobHistory.length === 0 && (
                <div className="text-center py-20 text-zinc-600">
                    <Clock className="h-10 w-10 mx-auto mb-4 opacity-20" />
                    <p>No runs found. Process a project to see history here.</p>
                </div>
            )}
        </div>
    )

    return (
        <div className="min-h-screen bg-zinc-950 font-sans text-zinc-100 selection:bg-blue-500/30">
            <Sidebar
                activeTab={activeTab}
                onTabChange={setActiveTab}
                onMobileConnect={() => setShowNetworkModal(true)}
            />

            <Layout>
                {activeTab === 'dashboard' && renderDashboard()}
                {activeTab === 'history' && renderHistory()}
                {activeTab === 'settings' && <Settings />}
            </Layout>

            {/* ── Toast ───────────────────────────────────────────── */}
            {toast && (
                <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 text-sm text-zinc-100 shadow-2xl animate-[slideIn_0.3s_ease-out]">
                    <Sparkles className="h-4 w-4 text-blue-500" />
                    {toast}
                    <button onClick={() => setToast(null)} className="ml-2 text-zinc-500 hover:text-white"><X className="h-3.5 w-3.5" /></button>
                </div>
            )}

            {/* ── Network Modal ───────────────────────────────────── */}
            {showNetworkModal && networkInfo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="relative w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-8 shadow-2xl">
                        <button onClick={() => setShowNetworkModal(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white">
                            <X className="h-5 w-5" />
                        </button>
                        <div className="text-center">
                            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-lg shadow-blue-900/30">
                                <Smartphone className="h-7 w-7" />
                            </div>
                            <h3 className="text-xl font-bold text-white tracking-tight">Connect Mobile App</h3>
                            <p className="mt-2 text-sm text-zinc-400">Scan this code with the DFVG mobile app to monitor progress remotely.</p>

                            <div className="mt-8 mb-8 flex justify-center p-1 bg-white rounded-xl overflow-hidden">
                                <QRCode value={networkInfo.url} size={200} />
                            </div>

                            <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-4">
                                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mb-1">Server Address</p>
                                <p className="font-mono text-sm text-blue-400 selection:bg-blue-500/30 tracking-tight">{networkInfo.url}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
