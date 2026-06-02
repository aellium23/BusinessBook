import { Component } from 'react'
import { AlertTriangle } from 'lucide-react'
import { logger } from '../lib/logger'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    logger.error('React error boundary', {
      error: error?.message || String(error),
      componentStack: info?.componentStack,
    })
    // Auto-recover from stale-chunk errors after a deploy (once per 10s)
    const msg = error?.message || String(error)
    if (/MIME type|dynamically imported module|Failed to fetch dynamically|Loading chunk|Importing a module script failed/i.test(msg)) {
      const KEY = 'chunk_reload_at'
      const last = Number(sessionStorage.getItem(KEY) || 0)
      if (Date.now() - last > 10000) {
        sessionStorage.setItem(KEY, String(Date.now()))
        window.location.reload()
      }
    }
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-6 text-center space-y-4">
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle size={24} className="text-red-500" />
          </div>
          <div>
            <h1 className="font-semibold text-gray-900 text-lg">Something went wrong</h1>
            <p className="text-sm text-gray-500 mt-1">
              An unexpected error occurred. Try reloading the page — if it persists, contact your admin.
            </p>
          </div>
          <details className="text-left bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
            <summary className="cursor-pointer font-medium">Technical details</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words">
              {String(this.state.error?.message || this.state.error)}
            </pre>
          </details>
          <div className="flex gap-2 justify-center">
            <button
              type="button"
              onClick={this.reset}
              className="btn-secondary text-sm">
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-primary text-sm">
              Reload page
            </button>
          </div>
        </div>
      </div>
    )
  }
}
