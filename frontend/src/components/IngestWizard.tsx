import { useState } from 'react'
import { HardDrive, FolderOpen, Play, Loader2, ArrowLeft } from 'lucide-react'
import { IngestPlan, DetectedDrive, ProcessingMode } from '../types'
import { cn } from '../utils'

interface IngestWizardProps {
    drive: DetectedDrive
    apiBase: string
    onCancel: () => void
    onJobStarted: (jobId: string) => void
    onBrowse?: () => Promise<string | null>
}

export function IngestWizard({ drive, apiBase, onCancel, onJobStarted, onBrowse }: IngestWizardProps) {
    const [step, setStep] = useState<'setup' | 'plan' | 'executing'>('setup')
    const [projectPath, setProjectPath] = useState('')
    const [mode, setMode] = useState<ProcessingMode>('FULL')
    const [plan, setPlan] = useState<IngestPlan | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handlePlan = async () => {
        if (!projectPath) return
        setLoading(true); setError(null)
        try {
            const res = await fetch(`${apiBase}/ingest`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source_path: drive.path, project_path: projectPath, mode })
            })
            if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || 'Plan failed') }
            const data = await res.json()
            setPlan(data); setStep('plan')
        } catch (err) { setError(err instanceof Error ? err.message : 'Plan failed') }
        finally { setLoading(false) }
    }

    const handleExecute = async () => {
        setStep('executing'); setError(null)
        try {
            const res = await fetch(`${apiBase}/ingest/execute`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source_path: drive.path, project_path: projectPath, mode, process_after: true })
            })
            if (!res.ok) throw new Error('Ingest failed')
            const result = await res.json()
            if (result.job_id) {
                onJobStarted(result.job_id)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ingest failed')
            setStep('plan')
        }
    }

    const modes: { key: ProcessingMode; label: string; desc: string; color: string }[] = [
        { key: 'FULL', label: 'Full', desc: 'ProRes + H.265 + exports', color: 'text-emerald-400' },
        { key: 'A', label: 'Compact', desc: 'H.265 proxies only', color: 'text-blue-400' },
        { key: 'B', label: 'ProRes', desc: 'ProRes 422 HQ intermediates', color: 'text-purple-400' },
    ]

    return (
        <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button onClick={onCancel}
                    className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors">
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-400">
                        <HardDrive className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-white">Import from {drive.label}</h2>
                        <p className="text-xs text-zinc-500 font-mono">{drive.path} · {drive.video_count} clips</p>
                    </div>
                    {drive.is_dji && (
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20">DJI</span>
                    )}
                </div>
            </div>

            {/* Step 1: Setup */}
            {step === 'setup' && (
                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 space-y-5">
                    <div>
                        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 block">Project Destination</label>
                        <div className="flex gap-3">
                            <div className="relative flex-1">
                                <FolderOpen className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-zinc-600" />
                                <input type="text" value={projectPath}
                                    onChange={(e) => setProjectPath(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handlePlan()}
                                    placeholder="e.g. ~/Movies/Beach_Sunset"
                                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-3 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-700 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                />
                            </div>
                            {onBrowse && (
                                <button onClick={async () => { const p = await onBrowse(); if (p) setProjectPath(p) }}
                                    className="rounded-xl border border-zinc-800 bg-zinc-900/80 px-5 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-800 transition-all">
                                    Browse
                                </button>
                            )}
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 block">Processing Mode</label>
                        <div className="grid grid-cols-3 gap-3">
                            {modes.map(m => (
                                <button key={m.key} onClick={() => setMode(m.key)}
                                    className={cn("p-3 rounded-xl border text-left transition-all",
                                        mode === m.key ? "border-zinc-600 bg-zinc-800/50" : "border-zinc-800/50 bg-zinc-900/30 hover:border-zinc-700"
                                    )}>
                                    <div className={cn("text-sm font-semibold mb-0.5", mode === m.key ? m.color : "text-zinc-400")}>{m.label}</div>
                                    <div className="text-[10px] text-zinc-600">{m.desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button onClick={onCancel} className="px-5 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-white transition-colors">Cancel</button>
                        <button onClick={handlePlan} disabled={loading || !projectPath}
                            className="flex items-center gap-2 rounded-xl bg-orange-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50 transition-all shadow-lg shadow-orange-900/20">
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
                            Plan Import
                        </button>
                    </div>

                    {error && (
                        <div className="rounded-xl bg-red-950/20 p-3 text-sm text-red-400 border border-red-900/30">{error}</div>
                    )}
                </section>
            )}

            {/* Step 2: Plan Preview */}
            {step === 'plan' && plan && (
                <section className="rounded-2xl border border-orange-800/30 bg-orange-950/10 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h3 className="text-base font-semibold text-zinc-100">Import Plan</h3>
                            {plan.is_dji_source && (
                                <span className="text-[9px] bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded font-bold uppercase">DJI Verified</span>
                            )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-zinc-500">
                            <span><span className="text-zinc-300 font-medium">{plan.to_copy}</span> to copy</span>
                            {plan.skipped > 0 && <span>{plan.skipped} skipped</span>}
                            {plan.sidecar_count > 0 && <span>{plan.sidecar_count} sidecars</span>}
                        </div>
                    </div>

                    <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                        {plan.files.filter(f => !f.skipped).map((file, i) => (
                            <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-900/60 text-xs">
                                <span className="text-zinc-300 font-mono truncate flex-1 mr-4">{file.destination}</span>
                                <div className="flex items-center gap-3 shrink-0">
                                    {file.sidecar_count > 0 && <span className="text-zinc-600">+{file.sidecar_count} sidecars</span>}
                                    {file.split_group && <span className="text-blue-400/50 text-[9px] font-mono">split:{file.split_group}</span>}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button onClick={() => setStep('setup')} className="px-5 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-white transition-colors">Back</button>
                        <button onClick={handleExecute} disabled={plan.to_copy === 0}
                            className="flex items-center gap-2 rounded-xl bg-orange-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50 transition-all shadow-lg shadow-orange-900/20">
                            <Play className="h-4 w-4" /> Import & Process
                        </button>
                    </div>
                </section>
            )}

            {/* Step 3: Executing */}
            {step === 'executing' && (
                <div className="flex flex-col items-center py-12 text-center">
                    <Loader2 className="h-10 w-10 text-orange-400 animate-spin mb-4" />
                    <p className="text-sm text-zinc-300 font-medium">Ingesting files…</p>
                    <p className="text-xs text-zinc-600 mt-1">Copying to project folder, then starting processing</p>
                </div>
            )}
        </div>
    )
}
