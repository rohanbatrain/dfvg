import { HardDrive } from 'lucide-react'
import { DetectedDrive } from '../types'
import { cn } from '../utils'

interface DriveCardProps {
    drive: DetectedDrive
    onImport: (drive: DetectedDrive) => void
    isNew?: boolean
}

export function DriveCard({ drive, onImport, isNew }: DriveCardProps) {
    return (
        <div className={cn(
            "relative rounded-xl border p-5 transition-all hover:shadow-lg hover:shadow-black/20",
            drive.is_dji
                ? "border-orange-800/30 bg-gradient-to-br from-orange-950/20 to-zinc-900/50 hover:border-orange-700/40"
                : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700",
            isNew && "ring-2 ring-orange-500/30 animate-pulse"
        )}>
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                    <div className={cn("p-2.5 rounded-xl",
                        drive.is_dji ? "bg-orange-500/10 text-orange-400" : "bg-zinc-800 text-zinc-500"
                    )}>
                        <HardDrive className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-zinc-100">{drive.label}</h3>
                        <p className="text-[11px] text-zinc-500 font-mono">{drive.path}</p>
                    </div>
                </div>
                {drive.is_dji && (
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20">
                        DJI
                    </span>
                )}
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 mb-4 text-xs text-zinc-500">
                <span><span className="text-zinc-300 font-medium">{drive.video_count}</span> clips</span>
            </div>

            {/* Action */}
            <button onClick={() => onImport(drive)}
                className={cn(
                    "w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all active:scale-[0.98]",
                    drive.is_dji
                        ? "bg-orange-600/90 text-white hover:bg-orange-500 shadow-lg shadow-orange-900/20"
                        : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700"
                )}>
                Import →
            </button>
        </div>
    )
}
