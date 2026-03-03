import { useState, useEffect, useCallback } from 'react'
import { Layout } from './components/Layout'
import { Sidebar } from './components/Sidebar'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Settings } from './components/Settings'
import { SourcesPanel } from './components/SourcesPanel'
import { IngestWizard } from './components/IngestWizard'
import { ProcessingView } from './components/ProcessingView'
import { ProjectsPanel } from './components/ProjectsPanel'
import { RunsPanel } from './components/RunsPanel'
import { MobileConnect } from './components/MobileConnect'
import { ClipCard } from './components/ClipCard'
import { Play, Loader2, Clapperboard, Gauge, Film, ArrowLeft, AlertCircle } from 'lucide-react'
import { TabId, DetectedDrive, JobResponse, RunInfo, ScanResponse, ClipInfo, ProcessingMode } from './types'
import { cn, formatDuration, formatRes } from './utils'

// ── Electron API ──────────────────────────────────────────────────
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

export default function App() {
    // ── Navigation ──────────────────────────
    const [tab, setTab] = useState<TabId>('sources')
    const [subView, setSubView] = useState<'main' | 'ingest' | 'processing' | 'scan-results'>('main')

    // ── API ──────────────────────────────────
    const [apiBase, setApiBase] = useState('/api')

    // ── Source Data ──────────────────────────
    const [detectedDrives, setDetectedDrives] = useState<DetectedDrive[]>([])
    const [selectedDrive, setSelectedDrive] = useState<DetectedDrive | null>(null)

    // ── Scan Data ────────────────────────────
    const [scanResult, setScanResult] = useState<ScanResponse | null>(null)
    const [isScanning, setIsScanning] = useState(false)
    const [scanPath, setScanPath] = useState('')

    // ── Job State ────────────────────────────
    const [activeJob, setActiveJob] = useState<JobResponse | null>(null)
    const [jobHistory, setJobHistory] = useState<JobResponse[]>([])
    const [runHistory, setRunHistory] = useState<RunInfo[]>([])
    const [projectPath, setProjectPath] = useState('')
    const [mode, setMode] = useState<ProcessingMode>('FULL')
    const [hwAccel, setHwAccel] = useState(true)

    // ── UI ────────────────────────────────────
    const [toasts, setToasts] = useState<string[]>([])
    const [networkInfo, setNetworkInfo] = useState<{ ip: string; port: number; url: string } | null>(null)
    const [showMobile, setShowMobile] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [dismissedPaths, setDismissedPaths] = useState<Set<string>>(new Set())
    const [apiReady, setApiReady] = useState(!isElectron) // non-Electron: ready immediately
    const [initialLoad, setInitialLoad] = useState(true)

    const showToast = useCallback((msg: string) => {
        setToasts(prev => [...prev.slice(-2), msg]) // keep max 3
        setTimeout(() => setToasts(prev => prev.slice(1)), 3000)
    }, [])

    // ── API Base Resolution ──────────────────
    useEffect(() => {
        if (isElectron) {
            window.electronAPI!.getApiPort().then(port => {
                setApiBase(`http://127.0.0.1:${port}`)
                setApiReady(true)
            })
        }
    }, [])

    // ── Network Info ─────────────────────────
    useEffect(() => {
        if (!apiReady) return
        fetch(`${apiBase}/network-info`)
            .then(r => r.json()).then(setNetworkInfo).catch(() => { })
    }, [apiBase, apiReady])

    // ── Drive Polling (every 3s) ─────────────
    useEffect(() => {
        if (!apiReady) return
        let active = true
        const poll = () => {
            fetch(`${apiBase}/drives`).then(r => r.json())
                .then((drives: DetectedDrive[]) => {
                    if (!active) return
                    // Filter out user-dismissed drives
                    const filtered = drives.filter(d => !dismissedPaths.has(d.path))
                    // Check for new drives
                    const prev = detectedDrives.map(d => d.path)
                    const newDrives = filtered.filter(d => !prev.includes(d.path))
                    if (newDrives.length > 0) {
                        const d = newDrives[0]
                        showToast(`${d.label} detected${d.is_dji ? ' (DJI)' : ''} — ${d.video_count} clips`)
                    }
                    setDetectedDrives(filtered)
                })
                .catch(() => { })
        }
        poll()
        const id = setInterval(poll, 3000)
        return () => { active = false; clearInterval(id) }
    }, [apiBase, apiReady]) // intentionally not including detectedDrives/dismissedPaths to avoid infinite loop

    // Mark initial load complete after first drive poll
    useEffect(() => {
        if (apiReady && initialLoad) {
            const t = setTimeout(() => setInitialLoad(false), 500)
            return () => clearTimeout(t)
        }
    }, [apiReady, initialLoad])

    // ── Job Polling ──────────────────────────
    useEffect(() => {
        if (!activeJob || ['completed', 'failed'].includes(activeJob.status)) return
        const id = setInterval(async () => {
            try {
                const res = await fetch(`${apiBase}/jobs/${activeJob.job_id}`)
                if (!res.ok) return
                const data: JobResponse = await res.json()
                setActiveJob(data)
                if (['completed', 'failed'].includes(data.status)) {
                    setJobHistory(prev => [data, ...prev])
                    if (data.status === 'completed') showToast('Processing complete ✓')
                    fetchRunHistory()
                }
            } catch { /* ignore */ }
        }, 1000)
        return () => clearInterval(id)
    }, [activeJob, apiBase])

    // ── Fetch Run History ────────────────────
    const fetchRunHistory = useCallback(async () => {
        if (!projectPath) return
        try {
            const res = await fetch(`${apiBase}/runs?project_path=${encodeURIComponent(projectPath)}`)
            if (res.ok) setRunHistory(await res.json())
        } catch { /* ignore */ }
    }, [apiBase, projectPath])

    // ── Handlers ─────────────────────────────
    const handleBrowse = async () => {
        if (!isElectron) return null
        return await window.electronAPI!.selectFolder()
    }

    const handleImportDrive = (drive: DetectedDrive) => {
        setSelectedDrive(drive)
        setSubView('ingest')
    }

    const handleEjectDrive = async (drive: DetectedDrive) => {
        try {
            const res = await fetch(`${apiBase}/drives/eject?path=${encodeURIComponent(drive.path)}`, { method: 'POST' })
            if (res.ok) {
                setDetectedDrives(prev => prev.filter(d => d.path !== drive.path))
                showToast(`${drive.label} ejected safely`)
            } else {
                const e = await res.json().catch(() => ({}))
                showToast(e.detail || 'Eject failed')
            }
        } catch { showToast('Eject failed') }
    }

    const handleDismissDrive = async (drive: DetectedDrive) => {
        try {
            await fetch(`${apiBase}/drives/dismiss?path=${encodeURIComponent(drive.path)}`, { method: 'POST' })
            setDismissedPaths(prev => new Set(prev).add(drive.path))
            setDetectedDrives(prev => prev.filter(d => d.path !== drive.path))
        } catch { /* ignore */ }
    }

    const handleScanPath = async (path: string) => {
        setScanPath(path); setProjectPath(path)
        setIsScanning(true); setError(null); setScanResult(null)
        try {
            const res = await fetch(`${apiBase}/scan?path=${encodeURIComponent(path)}`, { method: 'POST' })
            if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || 'Scan failed') }
            const data: ScanResponse = await res.json()
            setScanResult(data)
            setSubView('scan-results')
            showToast(`Found ${data.clips.length} clips`)
        } catch (err) { setError(err instanceof Error ? err.message : 'Scan failed') }
        finally { setIsScanning(false) }
    }

    const handleStartJob = async () => {
        if (!scanPath) return
        setError(null)
        try {
            const res = await fetch(`${apiBase}/jobs`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ input_path: scanPath, mode, hw_accel: hwAccel })
            })
            if (!res.ok) throw new Error('Failed to start job')
            const data: JobResponse = await res.json()
            setActiveJob(data)
            setSubView('processing')
            setTab('projects')
        } catch (err) { setError(err instanceof Error ? err.message : 'Failed to start') }
    }

    const handleJobStarted = (jobId: string, path?: string) => {
        if (path) setProjectPath(path)
        setActiveJob({ job_id: jobId, status: 'pending', progress: 0, message: 'Starting…' })
        setSubView('processing')
        setTab('projects')
    }

    const handleReset = () => {
        setActiveJob(null); setScanResult(null); setSubView('main')
        setTab('sources')
    }

    // ── Tab switching: reset sub-views ────────
    const handleTabChange = (newTab: TabId) => {
        setTab(newTab)
        // Only preserve processing sub-view when switching to projects tab
        if (!(subView === 'processing' && newTab === 'projects')) {
            setSubView('main')
        }
        // Auto-refresh run history when entering projects or runs tab
        if (newTab === 'projects' || newTab === 'runs') {
            fetchRunHistory()
        }
    }

    // ── Render ────────────────────────────────
    const renderContent = () => {
        // Ingest wizard overlay
        if (subView === 'ingest' && selectedDrive) {
            return (
                <IngestWizard
                    drive={selectedDrive}
                    apiBase={apiBase}
                    defaultMode={mode}
                    onCancel={() => setSubView('main')}
                    onJobStarted={handleJobStarted}
                    onBrowse={isElectron ? handleBrowse : undefined}
                />
            )
        }

        // Processing view
        if (subView === 'processing' && activeJob) {
            return (
                <ProcessingView
                    job={activeJob}
                    apiBase={apiBase}
                    projectPath={projectPath}
                    isElectron={isElectron}
                    onReset={handleReset}
                    onOpenFolder={isElectron ? (p) => window.electronAPI!.openFolder(p) : undefined}
                />
            )
        }

        // Scan results
        if (subView === 'scan-results' && scanResult) {
            return renderScanResults()
        }

        // Tab content
        switch (tab) {
            case 'sources':
                return (
                    <SourcesPanel
                        detectedDrives={detectedDrives}
                        onImportDrive={handleImportDrive}
                        onEjectDrive={handleEjectDrive}
                        onDismissDrive={handleDismissDrive}
                        onScanPath={handleScanPath}
                        onBrowse={isElectron ? handleBrowse : undefined}
                    />
                )
            case 'projects':
                return (
                    <ProjectsPanel
                        activeJob={activeJob}
                        runHistory={runHistory}
                        jobHistory={jobHistory}
                        projectPath={projectPath}
                        onViewProcessing={() => setSubView('processing')}
                    />
                )
            case 'runs':
                return <RunsPanel runHistory={runHistory} jobHistory={jobHistory} />
            case 'settings':
                return <Settings mode={mode} onModeChange={setMode} hwAccel={hwAccel} onHwAccelChange={setHwAccel} />
            default:
                return null
        }
    }

    const renderScanResults = () => {
        if (!scanResult) return null
        const totalDuration = scanResult.clips.reduce((s: number, c: ClipInfo) => s + c.duration, 0)
        const resolutions = new Set(scanResult.clips.map(c => formatRes(c.width, c.height)))
        const codecs = new Set(scanResult.clips.map(c => c.video_codec))

        return (
            <div className="space-y-6 animate-fade-in">
                {/* Back button */}
                <button onClick={() => setSubView('main')}
                    className="flex items-center gap-2 text-sm text-zinc-500 hover:text-white transition-colors">
                    <ArrowLeft className="h-4 w-4" /> Back to Sources
                </button>

                {/* Summary Bar */}
                <div className="flex flex-wrap items-center gap-6 rounded-xl border border-zinc-800/50 bg-zinc-900/20 px-5 py-3">
                    <div className="flex items-center gap-2 text-sm">
                        <Clapperboard className="h-4 w-4 text-blue-400" />
                        <span className="text-zinc-500">Clips:</span>
                        <span className="font-semibold text-white">{scanResult.clips.length}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <Gauge className="h-4 w-4 text-purple-400" />
                        <span className="text-zinc-500">Duration:</span>
                        <span className="font-semibold text-white">{formatDuration(totalDuration)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <Film className="h-4 w-4 text-emerald-400" />
                        <span className="text-zinc-500">Formats:</span>
                        <span className="font-medium text-zinc-300">{[...resolutions].join(', ')} · {[...codecs].join(', ')}</span>
                    </div>
                </div>

                {/* Mode selector + Process */}
                <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                        {(['FULL', 'A', 'B'] as ProcessingMode[]).map(m => (
                            <button key={m} onClick={() => setMode(m)}
                                className={cn("px-4 py-2 rounded-lg text-xs font-semibold transition-all border",
                                    mode === m ? "bg-zinc-800 text-white border-zinc-600" : "text-zinc-500 border-zinc-800/50 hover:border-zinc-700"
                                )}>
                                {m === 'FULL' ? 'Full' : m === 'A' ? 'Compact' : 'ProRes'}
                            </button>
                        ))}
                    </div>
                    <button onClick={handleStartJob}
                        className="flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3 text-sm font-medium text-white hover:bg-blue-500 transition-all active:scale-95 shadow-lg shadow-blue-900/20">
                        <Play className="h-4 w-4" /> Process All
                    </button>
                </div>

                {/* Clip Grid */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {scanResult.clips.map((clip, i) => (
                        <ClipCard key={clip.filename} clip={clip} index={i} />
                    ))}
                </div>

                {error && (
                    <div className="rounded-xl bg-red-950/20 p-3.5 text-sm text-red-400 border border-red-900/30 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                    </div>
                )}
            </div>
        )
    }

    return (
        <>
            <Sidebar
                activeTab={tab}
                onTabChange={handleTabChange}
                onMobileConnect={() => setShowMobile(true)}
                hasDrivesDetected={detectedDrives.length > 0}
                activeJob={activeJob}
            />
            <Layout activeTab={tab}>
                <ErrorBoundary>
                    {renderContent()}
                </ErrorBoundary>

                {/* Loading overlay for scan */}
                {isScanning && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm ml-64">
                        <div className="flex flex-col items-center gap-3">
                            <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
                            <span className="text-sm text-zinc-400 font-medium">Scanning footage…</span>
                        </div>
                    </div>
                )}

                {error && subView === 'main' && tab === 'sources' && (
                    <div className="mt-4 rounded-xl bg-red-950/20 p-3.5 text-sm text-red-400 border border-red-900/30 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                    </div>
                )}
            </Layout>

            {/* Toast Stack */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] flex flex-col-reverse gap-2">
                {toasts.map((t, i) => (
                    <div key={`${t}-${i}`} className="animate-[fadeIn_0.2s_ease-out] transition-all">
                        <div className="rounded-xl bg-zinc-800 border border-zinc-700 px-5 py-2.5 text-sm text-zinc-200 shadow-2xl font-medium whitespace-nowrap">
                            {t}
                        </div>
                    </div>
                ))}
            </div>

            {/* Mobile Connect Modal */}
            {showMobile && networkInfo && (
                <MobileConnect url={networkInfo.url} onClose={() => setShowMobile(false)} />
            )}
        </>
    )
}
