import { useState } from 'react'
import { FolderOpen, Info, Image, HardDrive, Usb, ArrowRight } from 'lucide-react'
import { DetectedDrive } from '../types'
import { DriveCard } from './DriveCard'

interface SourcesPanelProps {
    detectedDrives: DetectedDrive[]
    onImportDrive: (drive: DetectedDrive) => void
    onEjectDrive: (drive: DetectedDrive) => void
    onDismissDrive: (drive: DetectedDrive) => void
    onScanPath: (path: string) => void
    onBrowse?: () => Promise<string | null>
}

export function SourcesPanel({ detectedDrives, onImportDrive, onEjectDrive, onDismissDrive, onScanPath, onBrowse }: SourcesPanelProps) {
    const [manualPath, setManualPath] = useState('')

    return (
        <div className="max-w-5xl space-y-8 animate-fade-in">
            {/* Connected Sources */}
            <section>
                <div className="flex items-center gap-3 mb-5">
                    <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400">
                        <HardDrive className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-white">Connected Sources</h2>
                        <p className="text-xs text-zinc-500">Auto-detected external drives and SD cards.</p>
                    </div>
                </div>

                {detectedDrives.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {detectedDrives.map(drive => (
                            <DriveCard
                                key={drive.path}
                                drive={drive}
                                onImport={onImportDrive}
                                onEject={onEjectDrive}
                                onDismiss={onDismissDrive}
                            />
                        ))}
                    </div>
                ) : (
                    /* Gap 3: Polished empty state */
                    <div className="relative overflow-hidden rounded-2xl border border-dashed border-zinc-800 bg-gradient-to-br from-zinc-950 to-zinc-900/50 p-10 text-center">
                        {/* Decorative background circles */}
                        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-orange-500/5 blur-2xl" />
                        <div className="absolute -left-8 -bottom-8 h-24 w-24 rounded-full bg-blue-500/5 blur-2xl" />

                        <div className="relative">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-900 border border-zinc-800 shadow-lg">
                                <Usb className="h-7 w-7 text-zinc-600" />
                            </div>
                            <p className="text-sm font-medium text-zinc-400">No external drives detected</p>
                            <p className="text-xs text-zinc-600 mt-2 max-w-xs mx-auto leading-relaxed">
                                Plug in a DJI SD card or external drive to get started.
                                Drives are auto-detected every few seconds.
                            </p>

                            {/* Animated dots */}
                            <div className="mt-4 flex items-center justify-center gap-1">
                                <div className="h-1.5 w-1.5 rounded-full bg-zinc-700 animate-pulse" style={{ animationDelay: '0ms' }} />
                                <div className="h-1.5 w-1.5 rounded-full bg-zinc-700 animate-pulse" style={{ animationDelay: '300ms' }} />
                                <div className="h-1.5 w-1.5 rounded-full bg-zinc-700 animate-pulse" style={{ animationDelay: '600ms' }} />
                            </div>
                        </div>
                    </div>
                )}
            </section>

            {/* Divider */}
            <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-zinc-800" />
                <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">or</span>
                <div className="flex-1 h-px bg-zinc-800" />
            </div>

            {/* Manual Path */}
            <section>
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                        <FolderOpen className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-white">Select Folder Manually</h2>
                        <p className="text-xs text-zinc-500">Point to a folder containing video or image files.</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="relative flex-1">
                        <FolderOpen className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-zinc-600" />
                        <input type="text" value={manualPath}
                            onChange={(e) => setManualPath(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && manualPath && onScanPath(manualPath)}
                            placeholder="/path/to/footage"
                            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-3 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-700 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                        />
                    </div>
                    {onBrowse && (
                        <button onClick={async () => {
                            const p = await onBrowse()
                            if (p) { setManualPath(p); onScanPath(p) }
                        }}
                            className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 px-5 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-800 hover:border-zinc-700 transition-all active:scale-95">
                            Browse
                        </button>
                    )}
                    <button onClick={() => manualPath && onScanPath(manualPath)}
                        disabled={!manualPath}
                        className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shadow-lg shadow-blue-900/20">
                        <ArrowRight className="h-4 w-4" /> Scan
                    </button>
                </div>
            </section>

            {/* Supported formats */}
            <div className="flex items-center justify-center gap-6 text-[10px] text-zinc-600 uppercase tracking-widest font-semibold pt-4">
                <div className="flex items-center gap-1.5"><Info className="h-3 w-3" /> MP4 / MOV / MKV</div>
                <div className="flex items-center gap-1.5"><Image className="h-3 w-3" /> JPG / DNG</div>
                <div className="flex items-center gap-1.5"><Info className="h-3 w-3" /> DJI Action Series</div>
            </div>
        </div>
    )
}
