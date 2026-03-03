import { Component, ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface Props {
    children: ReactNode
}

interface State {
    hasError: boolean
    error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('ErrorBoundary caught:', error, info.componentStack)
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex min-h-[400px] items-center justify-center p-12">
                    <div className="max-w-md text-center space-y-4">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 border border-red-800/30">
                            <AlertTriangle className="h-6 w-6 text-red-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-white">Something went wrong</h3>
                        <p className="text-sm text-zinc-500 leading-relaxed">
                            An unexpected error occurred in this panel. This won't affect other parts of the application.
                        </p>
                        {this.state.error && (
                            <pre className="mt-3 rounded-xl bg-zinc-900 border border-zinc-800 p-4 text-xs text-red-400 font-mono text-left overflow-x-auto">
                                {this.state.error.message}
                            </pre>
                        )}
                        <button
                            onClick={() => this.setState({ hasError: false, error: null })}
                            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-zinc-800 border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-700 transition-all active:scale-95"
                        >
                            <RotateCcw className="h-4 w-4" /> Try Again
                        </button>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}
