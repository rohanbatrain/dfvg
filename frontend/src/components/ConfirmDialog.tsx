import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    variant?: 'danger' | 'warning'
    onConfirm: () => void
    onCancel: () => void
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'danger', onConfirm, onCancel }: ConfirmDialogProps) {
    const isDanger = variant === 'danger'

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
            <div className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl animate-[fadeIn_0.15s_ease-out]"
                onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start gap-4">
                    <div className={`shrink-0 p-2.5 rounded-xl ${isDanger ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                        <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div className="space-y-1.5">
                        <h3 className="text-sm font-semibold text-white">{title}</h3>
                        <p className="text-xs text-zinc-500 leading-relaxed">{message}</p>
                    </div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                    <button onClick={onCancel}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all">
                        {cancelLabel}
                    </button>
                    <button onClick={onConfirm}
                        className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 shadow-lg ${isDanger
                            ? 'bg-red-600 text-white hover:bg-red-500 shadow-red-900/20'
                            : 'bg-yellow-600 text-white hover:bg-yellow-500 shadow-yellow-900/20'
                            }`}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}
