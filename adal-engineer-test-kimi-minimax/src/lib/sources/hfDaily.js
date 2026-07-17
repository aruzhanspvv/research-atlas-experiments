// Hugging Face Daily Papers — best-effort corpus fetch.
// https://huggingface.co/api/daily_papers returns the day's picks; failures are
// swallowed and the caller degrades to the seed papers.

const HF_DAILY = 'https://huggingface.co/api/daily_papers'

export async function fetchDailyPapers(limit = 10) {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(HF_DAILY, { signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok) return { ok: false, papers: [], reason: `HTTP ${res.status}` }
    const body = await res.json()
    if (!Array.isArray(body)) return { ok: false, papers: [], reason: 'bad shape' }
    const papers = body.slice(0, limit).map((entry) => ({
      arxivId: entry?.paper?.id ?? null,
      title: entry?.paper?.title ?? '',
      abstract: entry?.paper?.summary ?? '',
      authors: Array.isArray(entry?.paper?.authors) ? entry.paper.authors.map((a) => a?.name).filter(Boolean) : [],
      publishedAt: entry?.published_at ?? null
    })).filter((p) => p.arxivId)
    return { ok: true, papers }
  } catch (err) {
    return { ok: false, papers: [], reason: err?.message ?? 'network' }
  }
}
