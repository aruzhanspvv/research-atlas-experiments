// Pulls real, current papers from the public arXiv API (no key required) for a
// seed topic and writes them into research-atlas's paper schema.
// Usage: node tools/fetch-arxiv.mjs "search query" [maxResults]
import { writeFile } from 'node:fs/promises'

const topic = process.argv[2] || 'LLM research idea generation'
const maxResults = Number(process.argv[3] || 14)

// AND together the significant terms so results stay on-topic; arXiv's plain
// `all:<phrase>` search silently ORs the words together otherwise.
const terms = topic.split(/\s+/).filter(Boolean)
const query = terms.map((w) => `all:${encodeURIComponent(w)}`).join('+AND+')

const url = `http://export.arxiv.org/api/query?search_query=${query}&start=0&max_results=${maxResults}&sortBy=relevance&sortOrder=descending`

function tag(xml, name) {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'g')
  return [...xml.matchAll(re)].map((m) => m[1])
}

function decode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function slug(id, title) {
  const short = id.split('/').pop().replace(/v\d+$/, '')
  return `arxiv-${short}`
}

async function main() {
  console.log(`Fetching arXiv for: "${topic}"`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`arXiv API error: ${res.status}`)
  const xml = await res.text()
  const entries = tag(xml, 'entry')
  console.log(`Got ${entries.length} entries`)

  const papers = entries.map((entry) => {
    const id = decode(tag(entry, 'id')[0] || '')
    const title = decode(tag(entry, 'title')[0] || '')
    const summary = decode(tag(entry, 'summary')[0] || '')
    const published = decode(tag(entry, 'published')[0] || '')
    const authorBlocks = tag(entry, 'author')
    const authors = authorBlocks.map((a) => decode(tag(a, 'name')[0] || '')).filter(Boolean)
    const categories = [...entry.matchAll(/<category[^>]*term="([^"]+)"/g)].map((m) => m[1])
    const year = published ? new Date(published).getFullYear() : new Date().getFullYear()

    return {
      id: slug(id),
      type: 'paper',
      source: 'arxiv',
      title,
      authors,
      year,
      venue: categories[0] || 'arXiv',
      abstract: summary,
      url: id,
      influence: 2
    }
  })

  await writeFile(
    new URL('../src/data/papers.raw.json', import.meta.url),
    JSON.stringify(papers, null, 2)
  )
  console.log(`Wrote ${papers.length} papers to src/data/papers.raw.json`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
