// Papers with Code enrichment (best-effort, swallows failures).
// Used to enrich a known arxiv id with a `codeUrl` and `tasks` field.
// Failures are reported back to the caller; the caller decides whether to
// degrade gracefully or surface a UI warning.

const PWC_API = 'https://paperswithcode.com/api/v1'

export async function enrichPaper(arxivId) {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(`${PWC_API}/papers/?arxiv_id=${encodeURIComponent(arxivId)}`, { signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
    const body = await res.json()
    const first = body?.results?.[0]
    if (!first) return { ok: false, reason: 'not found' }
    return {
      ok: true,
      codeUrl: first?.repository?.url ?? null,
      pwcUrl: first?.url ?? null,
      tasks: Array.isArray(first?.tasks) ? first.tasks.map((t) => t?.name).filter(Boolean) : []
    }
  } catch (err) {
    return { ok: false, reason: err?.message ?? 'network' }
  }
}
