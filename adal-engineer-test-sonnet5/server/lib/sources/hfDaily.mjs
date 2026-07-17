// Hugging Face Daily Papers — best-effort supplementary source (confirmed
// working via public JSON endpoint, unauthenticated). Note: Papers with
// Code's own API now permanently redirects to huggingface.co/papers/trending
// (verified: paperswithcode.com/api/v1/papers/ → 302 → HF), so we treat PwC
// as folded into/replaced by this source rather than implementing it
// separately — see README "Known Limitations" for detail.
import { fetchWithTimeout } from '../fetchTimeout.mjs'

const HF_DAILY_API = 'https://huggingface.co/api/daily_papers'
const HF_TIMEOUT_MS = 6000

export async function fetchHfDailyPapers(limit = 8) {
  try {
    const res = await fetchWithTimeout(`${HF_DAILY_API}?limit=${limit}`, {}, HF_TIMEOUT_MS)
    if (!res.ok) {
      console.warn(`[hfDaily] non-OK response ${res.status}, skipping source`)
      return []
    }
    const data = await res.json()
    return data.map((entry) => {
      const p = entry.paper
      return {
        id: `paper:hf:${p.id}`,
        type: 'paper',
        title: p.title,
        authors: (p.authors ?? []).map((a) => a.name),
        source: 'hf-daily',
        sourceUrl: `https://huggingface.co/papers/${p.id}`,
        year: p.publishedAt ? new Date(p.publishedAt).getFullYear() : null,
        abstract: p.summary || '',
        topics: ['hf-daily-trending'],
        influence: 2 // daily-papers curation implies some baseline visibility
      }
    })
  } catch (err) {
    console.warn('[hfDaily] source unavailable, skipping (best-effort):', err.message)
    return []
  }
}
