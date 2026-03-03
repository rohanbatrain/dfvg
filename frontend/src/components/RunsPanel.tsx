import { CheckCircle2, AlertCircle, Loader2, Clock } from 'lucide-react'
import { RunInfo, JobResponse } from '../types'
import { cn } from '../utils'

interface RunsPanelProps {
    runHistory: RunInfo[]
    jobHistory: JobResponse[]
}

export function RunsPanel({ runHistory, jobHistory }: RunsPanelProps) {
    return (
        <div className="max-w-4xl space-y-6 animate-fade-in">
            <header>
                <h2 className="text-2xl font-bold text-white tracking-tight">Run History</h2>
                <p className="text-zinc-500 text-sm mt-1">All processing runs across projects.</p>
            </header>

            {runHistory.length > 0 && (
                <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">From Manifests</h3>
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
            )}

            {jobHistory.length > 0 && (
                <div className="space-y-2">
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
                            <span className={cn("text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded bg-zinc-950",
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
                    <p className="text-sm">No runs found</p>
                    <p className="text-xs text-zinc-700 mt-1">Process a project to see history here</p>
                </div>
            )}
        </div>
    )
}
