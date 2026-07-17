// Shared outbound-fetch timeout helper. Bug #1 fix: every network call this
// server makes to an external service (arXiv, HF Daily Papers, OpenAI) MUST
// have a bounded timeout — an unreachable/slow upstream previously hung the
// Express request handler indefinitely with zero feedback to the client,
// which is indistinguishable from the app being frozen (confirmed via
// EVAL_REPORT.md Bug #1/C1/C3: `curl -m 20` to /api/reference with an
// invalid arXiv ID hung for the full 20s window with HTTP_STATUS:000).
//
// Wraps fetch() with AbortSignal.timeout() and normalizes the resulting
// AbortError into a recognizable TimeoutError so callers can map it to a
// clean 504/SOURCE_TIMEOUT response instead of letting it propagate as a
// generic, confusing failure.

export class FetchTimeoutError extends Error {
  constructor(url, ms) {
    super(`Request to ${url} timed out after ${ms}ms`)
    this.name = 'FetchTimeoutError'
    this.isTimeout = true
  }
}

const DEFAULT_TIMEOUT_MS = 8000

export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
  } catch (err) {
    // AbortSignal.timeout() rejects with a DOMException named 'TimeoutError'
    // (or 'AbortError' on older Node fetch implementations) — normalize both.
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new FetchTimeoutError(url, timeoutMs)
    }
    throw err
  }
}
