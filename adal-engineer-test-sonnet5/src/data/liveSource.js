// Frontend fetch wrapper for the backend API. Every call goes through
// /api/... which Vite proxies to the local Express server in dev (see
// vite.config.js) and which the same Express server serves directly in
// production (server/index.mjs). Centralizes error normalization so UI
// code (ideaComposer.js) gets consistent { ok, ...} or thrown Error(message).

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    })
  } catch {
    // C1: network unreachable
    throw new Error('Could not reach the server. Is it running?')
  }
  let data
  try {
    data = await res.json()
  } catch {
    data = null
  }
  if (!res.ok) {
    throw new Error(data?.message || `Request failed (${res.status})`)
  }
  return data
}

export function getStatus() {
  return request('/api/status')
}

export function generateIdeas(payload) {
  return request('/api/generate', { method: 'POST', body: JSON.stringify(payload) })
}

export function resolveReference(input) {
  return request('/api/reference', { method: 'POST', body: JSON.stringify({ input }) })
}

export function refreshPapers(queries = []) {
  return request('/api/refresh', { method: 'POST', body: JSON.stringify({ queries }) })
}
