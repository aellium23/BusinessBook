// Lightweight structured logger
// In development: logs to console with timestamp and level
// In production: silences info/warn, only logs errors
// Replace with Sentry/LogRocket/Datadog later by swapping the transport

const isDev = import.meta.env.DEV

function formatEntry(level, message, data) {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data,
  }
}

function log(level, message, data = {}) {
  const entry = formatEntry(level, message, data)

  if (isDev) {
    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]`
    if (level === 'error') {
      // eslint-disable-next-line no-console
      console.error(prefix, message, data)
    } else if (level === 'warn') {
      // eslint-disable-next-line no-console
      console.warn(prefix, message, data)
    } else {
      // eslint-disable-next-line no-console
      console.log(prefix, message, data)
    }
    return entry
  }

  // Production: only log errors (to console for now; swap with remote transport later)
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(`[${level.toUpperCase()}]`, message, data)
  }

  return entry
}

export const logger = {
  info(message, data) {
    return log('info', message, data)
  },

  warn(message, data) {
    return log('warn', message, data)
  },

  error(message, data) {
    return log('error', message, data)
  },

  /**
   * Log a performance measurement.
   * @param {string} label - what was measured (e.g. "Dashboard data load")
   * @param {number} durationMs - elapsed time in milliseconds
   * @param {object} [extra] - optional additional context
   */
  perf(label, durationMs, extra = {}) {
    const level = durationMs > 3000 ? 'warn' : 'info'
    return log(level, `[perf] ${label}`, { durationMs, ...extra })
  },
}
