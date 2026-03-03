import { X, Smartphone, Copy, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import QRCode from 'react-qr-code'

interface MobileConnectProps {
    url: string
    onClose: () => void
}

export function MobileConnect({ url, onClose }: MobileConnectProps) {
    const [copied, setCopied] = useState(false)

    const handleCopy = () => {
        navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
            onClick={onClose}>
            <div className="relative w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-8 shadow-2xl animate-[fadeIn_0.2s_ease-out]"
                onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose}
                    className="absolute right-4 top-4 rounded-lg p-1 text-zinc-600 hover:text-white transition-colors">
                    <X className="h-5 w-5" />
                </button>

                <div className="text-center mb-6">
                    <Smartphone className="h-8 w-8 mx-auto mb-3 text-blue-500" />
                    <h3 className="text-lg font-semibold text-white">Connect Mobile</h3>
                    <p className="text-xs text-zinc-500 mt-1">Scan with your phone to control DFVG remotely</p>
                </div>

                <div className="bg-white rounded-2xl p-4 mx-auto w-fit">
                    <QRCode value={url} size={180} level="M" />
                </div>

                <div className="mt-5 flex items-center gap-2">
                    <input type="text" value={url} readOnly
                        className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-400 font-mono" />
                    <button onClick={handleCopy}
                        className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors">
                        {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied ? 'Copied' : 'Copy'}
                    </button>
                </div>
            </div>
        </div>
    )
}
