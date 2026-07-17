// arXiv Atom API client. The guaranteed, hard-requirement paper source
// (no key needed). GET-only, CORS-friendly upstream — but we still proxy
// it through our server so the frontend never has cross-origin/rate-limit
// concerns and so results normalize into our node schema server-side.
import { fetchWithTimeout } from '../fetchTimeout.mjs'

const ARXIV_API = 'https://export.arxiv.org/api/query'
const ARXIV_TIMEOUT_MS = 8000

function parseEntries(xml) {
  // Lightweight regex-based Atom parsing (no DOM in Node by default;
  // avoids pulling in an XML parser dependency for a simple, stable feed).
  const entries = []
  const entryBlocks = xml.split('<entry>').slice(1)
  entryBlocks.forEach((block) => {
    const idMatch = block.match(/<id>(.*?)<\/id>/s)
    const titleMatch = block.match(/<title>(.*?)<\/title>/s)
    const summaryMatch = block.match(/<summary>(.*?)<\/summary>/s)
    const publishedMatch = block.match(/<published>(.*?)<\/published>/s)
    const authorMatches = [...block.matchAll(/<name>(.*?)<\/name>/gs)]
    const categoryMatches = [...block.matchAll(/<category term="([^"]+)"/g)]

    if (!idMatch || !titleMatch) return
    const arxivUrl = idMatch[1].trim()
    const arxivId = arxivUrl.split('/abs/')[1]?.replace(/v\d+$/, '') ?? arxivUrl
    const title = titleMatch[1].replace(/\s+/g, ' ').trim()
    const abstract = (summaryMatch?.[1] ?? '').replace(/\s+/g, ' ').trim()
    const year = publishedMatch ? new Date(publishedMatch[1]).getFullYear() : null
    const authors = authorMatches.map((m) => m[1].trim())
    const categories = categoryMatches.map((m) => m[1])

    entries.push({
      id: `paper:arxiv:${arxivId}`,
      type: 'paper',
      title,
      authors,
      source: 'arxiv',
      sourceUrl: `https://arxiv.org/abs/${arxivId}`,
      year,
      abstract,
      topics: categories.slice(0, 4),
      influence: 1
    })
  })
  return entries
}

// query: free-text search string. maxResults: cap (arXiv allows up to 2000
// but we keep it small — this is for seeding/topic-search, not bulk mining).
export async function searchArxiv(query, maxResults = 10) {
  const url = `${ARXIV_API}?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${maxResults}&sortBy=relevance&sortOrder=descending`
  const res = await fetchWithTimeout(url, { redirect: 'follow' }, ARXIV_TIMEOUT_MS)
  if (!res.ok) throw new Error(`arXiv API returned ${res.status}`)
  const xml = await res.text()
  return parseEntries(xml)
}

// Fetch a single paper by arXiv id (e.g. "2607.04439" or full URL/DOI-ish string).
export function extractArxivId(input) {
  const trimmed = input.trim()
  // Accept raw id, abs URL, pdf URL
  const m = trimmed.match(/(\d{4}\.\d{4,5})(v\d+)?/)
  return m ? m[1] : null
}

export async function fetchArxivById(arxivId) {
  const url = `${ARXIV_API}?id_list=${encodeURIComponent(arxivId)}`
  const res = await fetchWithTimeout(url, { redirect: 'follow' }, ARXIV_TIMEOUT_MS)
  if (!res.ok) throw new Error(`arXiv API returned ${res.status}`)
  const xml = await res.text()
  const entries = parseEntries(xml)
  return entries[0] ?? null
}

// A curated set of query terms used to seed the initial ~20-30 paper
// dataset across a handful of topic clusters, so the map has real,
// clustered variety on first load (not a random single-topic dump).
export const SEED_QUERIES = [
  { query: 'large language model research idea generation', topic: 'llm-ideation', count: 5 },
  { query: 'scientific hypothesis generation with large language models', topic: 'llm-ideation', count: 4 },
  { query: 'retrieval augmented generation', topic: 'retrieval-augmented-generation', count: 4 },
  { query: 'large language model agents planning', topic: 'llm-agents', count: 4 },
  { query: 'novelty detection prior art scientific literature', topic: 'novelty-detection', count: 4 },
  { query: 'embedding based semantic similarity scientific papers', topic: 'semantic-similarity', count: 3 },
  { query: 'automated scientific discovery AI', topic: 'automated-discovery', count: 4 }
]
