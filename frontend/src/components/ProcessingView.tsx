import { Loader2, CheckCircle2, AlertCircle, Eye, ExternalLink, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { JobResponse, VerifyResult } from '../types'
import { cn } from '../utils'

interface ProcessingViewProps {
    job: JobResponse
    apiBase: string
    projectPath: string
    isElectron: boolean
    onReset: () => void
    onOpenFolder?: (path: string) => void
}

export function ProcessingView({ job, apiBase, projectPath, isElectron, onReset, onOpenFolder }: ProcessingViewProps) {
    const [previewFrame, setPreviewFrame] = useState<string | null>(null)
    const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)
    const [isVerifying, setIsVerifying] = useState(false)
    const [isCleaning, setIsCleaning] = useState(false)

    // WebSocket preview
    useEffect(() => {
        if (job.status !== 'processing') { setPreviewFrame(null); return }
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
    }, [job.status, apiBase])

    const handleVerify = async () => {
        setIsVerifying(true); setVerifyResult(null)
        try {
            const res = await fetch(`${apiBase}/verify?project_path=${encodeURIComponent(projectPath)}`, { method: 'POST' })
            if (res.ok) setVerifyResult(await res.json())
        } catch { /* ignore */ }
        finally { setIsVerifying(false) }
    }

    const handleCleanup = async () => {
        if (!confirm('This will PERMANENTLY delete source files from 01_ORIGINALS/. Are you sure?')) return
        setIsCleaning(true)
        try {
            await fetch(`${apiBase}/cleanup`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project_path: projectPath })
            })
        } catch { /* ignore */ }
        finally { setIsCleaning(false) }
    }

    const statusIcon = job.status === 'completed' ? <CheckCircle2 className="h-12 w-12 text-green-500" /> :
        job.status === 'failed' ? <AlertCircle className="h-12 w-12 text-red-500" /> :
            <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />

    const statusLabel = job.status === 'completed' ? 'Processing Complete' :
        job.status === 'failed' ? 'Processing Failed' : 'Processing…'

    return (
        <div className="max-w-2xl mx-auto py-8">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-8 text-center space-y-6">
                {/* Status */}
                <div className="flex flex-col items-center gap-3">
                    {statusIcon}
                    <h2 className="text-xl font-bold text-white">{statusLabel}</h2>
                    <p className="text-sm text-zinc-500">{job.message}</p>
                    {job.current_file && job.status === 'processing' && (
                        <p className="text-xs text-zinc-600 font-mono truncate max-w-sm">{job.current_file}</p>
                    )}
                </div>

                {/* Live Preview */}
                {previewFrame && job.status === 'processing' && (
                    <div className="rounded-xl overflow-hidden border border-zinc-800 bg-black mx-auto max-w-md">
                        <img src={`data:image/jpeg;base64,${previewFrame}`} alt="Live preview" className="w-full h-auto" />
                        <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-red-400 font-semibold uppercase">
                            <Eye className="h-3 w-3" /> Live Preview
                        </div>
                    </div>
                )}

                {/* Progress */}
                <div className="w-full max-w-lg mx-auto">
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                        <div className={cn("absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out",
                            job.status === 'failed' ? "bg-red-500" :
                                job.status === 'completed' ? "bg-green-500" : "bg-blue-500"
                        )} style={{ width: `${job.progress * 100}%` }} />
                    </div>
                    <div className="mt-2 flex justify-between text-xs font-mono">
                        <span className="text-zinc-600">Progress</span>
                        <span className="text-zinc-300 font-semibold">{(job.progress * 100).toFixed(0)}%</span>
                    </div>
                </div>

                {/* Completed Actions */}
                {job.status === 'completed' && (
                    <div className="space-y-4 pt-2">
                        <div className="flex items-center justify-center gap-3">
                            {isElectron && onOpenFolder && (
                                <button onClick={() => onOpenFolder(projectPath)}
                                    className="flex items-center gap-2 rounded-xl bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-700 transition-all border border-zinc-700">
                                    <ExternalLink className="h-4 w-4" /> Open Output
                                </button>
                            )}
                            <button onClick={onReset}
                                className="flex items-center gap-2 rounded-xl bg-zinc-100 px-5 py-2.5 text-sm font-medium text-zinc-900 hover:bg-white transition-all shadow-lg shadow-zinc-900/30">
                                <RotateCcw className="h-4 w-4" /> New Import
                            </button>
                        </div>

                        {/* Verify & Cleanup */}
                        <div className="flex items-center justify-center gap-3">
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
                            <div className={cn("flex items-center justify-center gap-2 text-xs px-3 py-1.5 rounded-lg mx-auto w-fit",
                                verifyResult.all_verified ? "bg-emerald-900/20 text-emerald-400 border border-emerald-800/30" : "bg-red-900/20 text-red-400 border border-red-800/30"
                            )}>
                                {verifyResult.all_verified ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                                {verifyResult.passed}/{verifyResult.total_outputs} verified
                                {verifyResult.failed > 0 && ` · ${verifyResult.failed} failed`}
                            </div>
                        )}
                    </div>
                )}

                {/* Failed */}
                {job.status === 'failed' && (
                    <button onClick={onReset}
                        className="flex items-center gap-2 rounded-xl bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-700 transition-all border border-zinc-700 mx-auto">
                        <RotateCcw className="h-4 w-4" /> Try Again
                    </button>
                )}
            </div>
        </div>
    )
}
