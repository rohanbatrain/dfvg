import { ReactNode } from 'react'
import { TabId } from '../types'

interface LayoutProps {
    children: ReactNode
    activeTab: TabId
}

const tabTitles: Record<TabId, string> = {
    sources: 'Sources',
    projects: 'Projects',
    runs: 'Runs',
    settings: 'Settings',
}

export function Layout({ children, activeTab }: LayoutProps) {
    return (
        <main className="ml-64 min-h-screen bg-zinc-950 text-zinc-100">
            {/* Draggable Title Bar Area */}
            <div className="fixed top-0 left-64 right-0 h-10 w-[calc(100%-16rem)] z-50 bg-zinc-950/80 backdrop-blur-sm border-b border-zinc-800/50 flex justify-center items-center"
                style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
                <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
                    {tabTitles[activeTab]}
                </span>
            </div>

            <div className="mx-auto max-w-5xl p-8 pt-16">
                {children}
            </div>
        </main>
    )
}
