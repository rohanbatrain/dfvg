import { Home, List, Settings, Smartphone, Film } from 'lucide-react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

interface SidebarProps {
    activeTab: 'dashboard' | 'history' | 'settings'
    onTabChange: (tab: 'dashboard' | 'history' | 'settings') => void
    onMobileConnect: () => void
}

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs))
}

export function Sidebar({ activeTab, onTabChange, onMobileConnect }: SidebarProps) {
    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: Home },
        { id: 'history', label: 'History', icon: List },
        { id: 'settings', label: 'Settings', icon: Settings },
    ] as const

    return (
        <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-zinc-800 bg-zinc-950 px-4 pt-10 text-zinc-100 flex flex-col justify-between"
            style={{ paddingTop: '2.5rem' /* Space for draggable title bar */ }}>

            {/* Logo Area */}
            <div className="mb-8 px-2 flex items-center gap-3">
                <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-lg shadow-blue-900/20">
                    <Film className="h-5 w-5 text-white" />
                    <div className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-zinc-950" />
                </div>
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-white">DFVG</h1>
                    <p className="text-[10px] text-zinc-500 font-medium tracking-wide">PRO RES TOOL</p>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => onTabChange(item.id)}
                        className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                            activeTab === item.id
                                ? "bg-zinc-900 text-white shadow-sm shadow-zinc-950/50"
                                : "text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-300"
                        )}
                    >
                        <item.icon className={cn("h-4 w-4", activeTab === item.id ? "text-blue-500" : "text-zinc-600 group-hover:text-zinc-400")} />
                        {item.label}
                    </button>
                ))}
            </nav>

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
