import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// ── Error Boundary ────────────────────────────────────────────────
class ErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean; error: Error | null }
> {
    constructor(props: { children: React.ReactNode }) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[DFVG] Uncaught error:', error, info)
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-gray-950 flex items-center justify-center p-8">
                    <div className="max-w-md text-center">
                        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20">
                            <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-semibold text-white mb-2">Something went wrong</h2>
                        <p className="text-sm text-gray-400 mb-6">
                            {this.state.error?.message || 'An unexpected error occurred.'}
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            className="rounded-xl bg-gray-800 px-6 py-2.5 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
                        >
                            Reload Application
                        </button>
                    </div>
                </div>
            )
        }
        return this.props.children
    }
}

// ── Mount ─────────────────────────────────────────────────────────
const root = document.getElementById('root')
if (root) {
    ReactDOM.createRoot(root).render(
        <React.StrictMode>
            <ErrorBoundary>
                <App />
            </ErrorBoundary>
        </React.StrictMode>
    )
}
