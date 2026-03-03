import { Monitor, Cpu, Sparkles } from 'lucide-react'
import { ProcessingMode } from '../types'

interface SettingsProps {
    mode: ProcessingMode
    onModeChange: (mode: ProcessingMode) => void
    hwAccel: boolean
    onHwAccelChange: (enabled: boolean) => void
}

export function Settings({ mode, onModeChange, hwAccel, onHwAccelChange }: SettingsProps) {
    const modes: { key: ProcessingMode; label: string; color: string; activeBg: string; activeBorder: string; desc: string; badge?: string }[] = [
        {
            key: 'FULL',
            label: 'Full Mode',
            color: 'text-emerald-400',
            activeBg: 'bg-emerald-500/10',
            activeBorder: 'border-emerald-500/50',
            desc: 'Generates everything: ProRes HQ masters + H.265 proxies + 1080p previews + 2K exports. One run, fully edit-ready.',
            badge: 'Recommended'
        },
        {
            key: 'A',
            label: 'Compact Mode',
            color: 'text-blue-400',
            activeBg: 'bg-blue-500/10',
            activeBorder: 'border-blue-500/50',
            desc: 'Generates H.265 proxies only (720p). Best for quick reviews and mobile transfer.',
        },
        {
            key: 'B',
            label: 'ProRes Mode',
            color: 'text-purple-400',
            activeBg: 'bg-purple-500/10',
            activeBorder: 'border-purple-500/50',
            desc: 'Generates ProRes 422 HQ intermediates + proxies. For professional editing only.',
        },
    ]

    return (
        <div className="mx-auto max-w-3xl space-y-10 animate-fade-in">
            <header className="text-center">
                <h2 className="text-2xl font-bold text-white tracking-tight">Settings</h2>
                <p className="text-zinc-500 text-sm mt-1">Configure processing defaults and application behavior.</p>
            </header>

            {/* Processing Engine */}
            <section className="space-y-4">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500"><Cpu className="h-5 w-5" /></div>
                    <h3 className="text-lg font-semibold text-zinc-200">Processing Engine</h3>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    {modes.map(m => (
                        <button key={m.key} onClick={() => onModeChange(m.key)}
                            className={`group relative p-4 rounded-xl border text-left transition-all ${mode === m.key ? `${m.activeBg} ${m.activeBorder}` : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}>
                            {m.badge && (
                                <span className="absolute -top-2 right-3 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                    {m.badge}
                                </span>
                            )}
                            <div className="flex justify-between items-start mb-2">
                                <span className={`text-sm font-semibold ${mode === m.key ? m.color : 'text-zinc-300'}`}>{m.label}</span>
                                {mode === m.key && <Sparkles className={`h-4 w-4 ${m.color}`} />}
                            </div>
                            <p className="text-xs text-zinc-500 leading-relaxed">{m.desc}</p>
                        </button>
                    ))}
                </div>

                {/* Hardware Acceleration — proper toggle switch */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-900 border border-zinc-800">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-zinc-200 font-medium text-sm">
                            <Monitor className="h-4 w-4 text-zinc-500" />
                            Hardware Acceleration
                        </div>
                        <p className="text-xs text-zinc-500">Use VideoToolbox (macOS) or NVENC for faster encoding.</p>
                    </div>
                    <button onClick={() => onHwAccelChange(!hwAccel)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25 ${hwAccel ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                        role="switch"
                        aria-checked={hwAccel}>
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${hwAccel ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                </div>

                {/* Current Mode Badge */}
                <div className="text-center pt-2">
                    <span className="text-[10px] uppercase tracking-widest text-zinc-600">
                        Default mode: <span className="text-zinc-400 font-semibold">{mode === 'FULL' ? 'Full' : mode === 'A' ? 'Compact' : 'ProRes'}</span> — applied to all new imports
                    </span>
                </div>
            </section>
        </div>
    )
}
