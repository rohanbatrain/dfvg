import { HardDrive, FolderOpen, List, Settings as SettingsIcon, Smartphone, Film, Loader2 } from 'lucide-react'
import { TabId, JobResponse } from '../types'
import { cn } from '../utils'

interface SidebarProps {
    activeTab: TabId
    onTabChange: (tab: TabId) => void
    onMobileConnect: () => void
    hasDrivesDetected: boolean
    activeJob: JobResponse | null
}

export function Sidebar({ activeTab, onTabChange, onMobileConnect, hasDrivesDetected, activeJob }: SidebarProps) {
    const isProcessing = activeJob && ['pending', 'processing'].includes(activeJob.status)

    const navItems: { id: TabId; label: string; icon: typeof HardDrive }[] = [
        { id: 'sources', label: 'Sources', icon: HardDrive },
        { id: 'projects', label: 'Projects', icon: FolderOpen },
        { id: 'runs', label: 'Runs', icon: List },
        { id: 'settings', label: 'Settings', icon: SettingsIcon },
    ]

    return (
        <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-zinc-800 bg-zinc-950 px-4 text-zinc-100 flex flex-col justify-between"
            style={{ paddingTop: '2.5rem' }}>

            {/* Logo Area */}
            <div className="mb-8 px-2 flex items-center gap-3">
                <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-lg shadow-blue-900/20">
                    <Film className="h-5 w-5 text-white" />
                    <div className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-zinc-950" />
                </div>
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-white">DFVG</h1>
                    <p className="text-[10px] text-zinc-500 font-medium tracking-wide">COMMAND CENTER</p>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => onTabChange(item.id)}
                        className={cn(
                            "relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                            activeTab === item.id
                                ? "bg-zinc-900 text-white shadow-sm shadow-zinc-950/50"
                                : "text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-300"
                        )}
                    >
                        <item.icon className={cn("h-4 w-4", activeTab === item.id ? "text-blue-500" : "text-zinc-600")} />
                        {item.label}
                        {/* Drive detection pulse on Sources */}
                        {item.id === 'sources' && hasDrivesDetected && (
                            <span className="absolute right-3 flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-60" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
                            </span>
                        )}
                        {/* Active processing spinner on Projects */}
                        {item.id === 'projects' && isProcessing && (
                            <span className="absolute right-3">
                                <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />
                            </span>
                        )}
                    </button>
                ))}
            </nav>

            {/* Global Progress Bar */}
            {isProcessing && activeJob && (
                <div className="mx-2 mb-4">
                    <button onClick={() => onTabChange('projects')}
                        className="w-full rounded-xl border border-blue-800/30 bg-blue-950/10 p-3 text-left hover:border-blue-700/40 transition-all group">
                        <div className="flex items-center gap-2 mb-2">
                            <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />
                            <span className="text-[11px] font-semibold text-zinc-300 group-hover:text-white transition-colors">Processing</span>
                            <span className="ml-auto text-[11px] font-mono text-blue-400">{(activeJob.progress * 100).toFixed(0)}%</span>
                        </div>
                        <div className="relative h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                            <div className="absolute inset-y-0 left-0 rounded-full bg-blue-500 transition-all duration-500"
                                style={{ width: `${activeJob.progress * 100}%` }} />
                        </div>
                        {activeJob.current_file && (
                            <p className="text-[9px] text-zinc-600 font-mono mt-1.5 truncate">{activeJob.current_file}</p>
                        )}
                    </button>
                </div>
            )}

            {/* Footer Actions */}
            <div className="mb-6 space-y-3 px-2">
                <button
                    onClick={onMobileConnect}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-xs font-semibold text-zinc-400 hover:bg-zinc-800 hover:text-white transition-all active:scale-[0.98]"
                >
                    <Smartphone className="h-4 w-4" />
                    Connect Mobile
                </button>
                <div className="text-center text-[10px] text-zinc-700 font-mono">
                    v1.0.0 · Electron
                </div>
            </div>
        </aside>
    )
}
