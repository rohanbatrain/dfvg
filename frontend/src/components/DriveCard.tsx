import { HardDrive, ArrowUpFromLine, X } from 'lucide-react'
import { DetectedDrive } from '../types'
import { cn } from '../utils'

interface DriveCardProps {
    drive: DetectedDrive
    onImport: (drive: DetectedDrive) => void
    onEject: (drive: DetectedDrive) => void
    onDismiss: (drive: DetectedDrive) => void
    isNew?: boolean
}

export function DriveCard({ drive, onImport, onEject, onDismiss, isNew }: DriveCardProps) {
    return (
        <div className={cn(
            "relative rounded-xl border p-5 transition-all hover:shadow-lg hover:shadow-black/20",
            drive.is_dji
                ? "border-orange-800/30 bg-gradient-to-br from-orange-950/20 to-zinc-900/50 hover:border-orange-700/40"
                : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700",
            isNew && "ring-2 ring-orange-500/30 animate-pulse"
        )}>
            {/* Dismiss X */}
            <button onClick={(e) => { e.stopPropagation(); onDismiss(drive) }}
                className="absolute top-3 right-3 p-1 rounded-md text-zinc-700 hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
                title="Dismiss">
                <X className="h-3.5 w-3.5" />
            </button>

            {/* Header */}
            <div className="flex items-start gap-3 mb-3 pr-6">
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

            {/* Badge + Stats */}
            <div className="flex items-center gap-3 mb-4">
                {drive.is_dji && (
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20">
                        DJI Verified
                    </span>
                )}
                <span className="text-xs text-zinc-500"><span className="text-zinc-300 font-medium">{drive.video_count}</span> clips</span>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
                <button onClick={() => onImport(drive)}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all active:scale-[0.98]",
                        drive.is_dji
                            ? "bg-orange-600/90 text-white hover:bg-orange-500 shadow-lg shadow-orange-900/20"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700"
                    )}>
                    Import →
                </button>
                <button onClick={() => onEject(drive)}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs font-medium text-zinc-500 hover:text-red-400 hover:border-red-800/40 hover:bg-red-950/10 transition-all"
                    title="Safely eject drive">
                    <ArrowUpFromLine className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    )
}
