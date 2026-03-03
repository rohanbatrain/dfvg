import { CheckCircle2, AlertCircle, Loader2, Clock } from 'lucide-react'
import { RunInfo, JobResponse } from '../types'
import { cn } from '../utils'

interface ProjectsPanelProps {
    activeJob: JobResponse | null
    runHistory: RunInfo[]
    jobHistory: JobResponse[]
    projectPath: string
    onViewProcessing: () => void
}

export function ProjectsPanel({ activeJob, runHistory, jobHistory, onViewProcessing }: ProjectsPanelProps) {
    return (
        <div className="max-w-4xl space-y-8 animate-fade-in">
            {/* Active Job */}
            {activeJob && ['pending', 'processing'].includes(activeJob.status) && (
                <section>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Active</h2>
                    <button onClick={onViewProcessing}
                        className="w-full rounded-xl border border-blue-800/30 bg-blue-950/10 p-5 text-left hover:border-blue-700/40 transition-all">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                                <span className="text-sm font-semibold text-white">Processing in Progress</span>
                            </div>
                            <span className="text-xs text-blue-400 font-mono">{(activeJob.progress * 100).toFixed(0)}%</span>
                        </div>
                        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                            <div className="absolute inset-y-0 left-0 rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${activeJob.progress * 100}%` }} />
                        </div>
                        {activeJob.current_file && (
                            <p className="text-xs text-zinc-600 font-mono mt-2 truncate">{activeJob.current_file}</p>
                        )}
                    </button>
                </section>
            )}

            {/* Run History */}
            <section>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Recent Projects</h2>
                {runHistory.length > 0 ? (
                    <div className="space-y-2">
                        {runHistory.map(run => (
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
                                        {run.started_at && <div className="text-[10px] text-zinc-600 mt-0.5">{run.started_at}</div>}
                                    </div>
                                </div>
                                <span className={cn("text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded bg-zinc-950",
                                    run.status === 'COMPLETED' ? 'text-green-500' :
                                        run.status === 'FAILED' ? 'text-red-500' :
                                            run.status === 'INTERRUPTED' ? 'text-yellow-500' : 'text-blue-500')}>
                                    {run.status}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : jobHistory.length > 0 ? (
                    <div className="space-y-2">
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
                                <span className={cn("text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded bg-zinc-950",
                                    j.status === 'completed' ? 'text-green-500' :
                                        j.status === 'failed' ? 'text-red-500' : 'text-blue-500')}>
                                    {j.status}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-16 text-zinc-600">
                        <Clock className="h-10 w-10 mx-auto mb-4 opacity-20" />
                        <p className="text-sm">No projects yet</p>
                        <p className="text-xs text-zinc-700 mt-1">Import from Sources to get started</p>
                    </div>
                )}
            </section>
        </div>
    )
}
