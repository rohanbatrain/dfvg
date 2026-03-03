import { FileVideo, MapPin, Image } from 'lucide-react'
import { ClipInfo } from '../types'
import { cn, formatDuration, formatRes } from '../utils'

interface ClipCardProps {
    clip: ClipInfo
    index: number
}

export function ClipCard({ clip, index }: ClipCardProps) {
    const isImage = /\.(jpe?g|dng)$/i.test(clip.filename)

    return (
        <div className="group rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-4 transition-all hover:border-zinc-700 hover:bg-zinc-900/50 hover:shadow-lg hover:shadow-black/20"
            style={{ animationDelay: `${index * 50}ms`, animation: 'fadeIn 0.3s ease-out both' }}>
            <div className="mb-2.5 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    {isImage
                        ? <Image className="h-4 w-4 shrink-0 text-zinc-600 group-hover:text-emerald-500 transition-colors" />
                        : <FileVideo className="h-4 w-4 shrink-0 text-zinc-600 group-hover:text-blue-500 transition-colors" />
                    }
                    <span className="font-medium text-zinc-200 truncate text-sm" title={clip.filename}>{clip.filename}</span>
                </div>
                <span className={cn("shrink-0 px-2 py-0.5 rounded-md text-[10px] uppercase font-bold tracking-wider",
                    clip.color_profile === 'D-Log M' ? "bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20" :
                        clip.color_profile === 'D-Cinelike' ? "bg-yellow-500/10 text-yellow-400 ring-1 ring-yellow-500/20" :
                            "bg-green-500/10 text-green-400 ring-1 ring-green-500/20"
                )}>
                    {clip.color_profile}
                </span>
            </div>
            <div className="grid grid-cols-3 gap-y-1.5 text-[11px]">
                <div className="text-zinc-500"><span className="text-zinc-300 font-medium">{formatRes(clip.width, clip.height)}</span></div>
                <div className="text-zinc-500"><span className="text-zinc-300 font-medium">{clip.fps}</span> fps</div>
                <div className="text-zinc-500"><span className="text-zinc-300 font-medium">{formatDuration(clip.duration)}</span></div>
                <div className="text-zinc-500 col-span-2"><span className="text-zinc-400">{clip.video_codec}</span> · {clip.bit_depth}-bit</div>
                {clip.camera_model && <div className="text-zinc-600 col-span-3 truncate">{clip.camera_model}</div>}
            </div>
            {/* Scene tags */}
            {clip.tags && clip.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                    {clip.tags.map(tag => (
                        <span key={tag} className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20">
                            {tag}
                        </span>
                    ))}
                </div>
            )}
            {/* GPS indicator */}
            {clip.gps_summary && (
                <div className="mt-1.5 flex items-center gap-1 text-[10px] text-zinc-500">
                    <MapPin className="h-3 w-3 text-emerald-500" />
                    <span>{clip.gps_summary.total_distance_m.toFixed(0)}m · {clip.gps_summary.avg_speed_kmh.toFixed(1)} km/h</span>
                </div>
            )}
        </div>
    )
}
