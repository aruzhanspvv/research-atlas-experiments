// Offline fetch: pulls recent papers from arXiv (per category) and HF Daily Papers.
// Free/keyless sources only. Writes data-pipeline/raw/*.json for manual curation.
import { writeFileSync, mkdirSync } from 'node:fs'

const CATS = ['cs.LG', 'cs.CL', 'cs.AI', 'cs.CV', 'cs.RO', 'cs.NE', 'stat.ML']
mkdirSync('data-pipeline/raw', { recursive: true })

function parseArxivXml(xml) {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1])
  return entries.map((e) => {
    const get = (tag) => (e.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)) || [, ''])[1].trim()
    const id = get('id').replace('http://arxiv.org/abs/', '').replace(/v\d+$/, '')
    const title = get('title').replace(/\s+/g, ' ').trim()
    const summary = get('summary').replace(/\s+/g, ' ').trim()
    const published = get('published').slice(0, 10)
    const authors = [...e.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => m[1].trim())
    const primaryCat = (e.match(/<arxiv:primary_category[^>]*term="([^"]+)"/) || [, ''])[1]
    return { id, title, summary, published, authors, primaryCat, url: `https://arxiv.org/abs/${id}` }
  })
}

async function fetchArxiv(cat) {
  const url = `https://export.arxiv.org/api/query?search_query=cat:${cat}&sortBy=submittedDate&sortOrder=descending&max_results=25`
  const res = await fetch(url)
  const xml = await res.text()
  return parseArxivXml(xml)
}

async function fetchHfDaily() {
  const res = await fetch('https://huggingface.co/api/daily_papers?limit=60')
  const data = await res.json()
  return data.map((d) => ({
    id: d.paper.id,
    title: d.title,
    summary: d.summary,
    published: (d.publishedAt || '').slice(0, 10),
    authors: (d.paper.authors || []).map((a) => a.name),
    upvotes: d.paper.upvotes,
    url: `https://arxiv.org/abs/${d.paper.id}`
  }))
}

const results = {}
for (const cat of CATS) {
  console.error('fetching', cat)
  results[cat] = await fetchArxiv(cat)
}
results.hf_daily = await fetchHfDaily()

writeFileSync('data-pipeline/raw/papers.json', JSON.stringify(results, null, 2))
console.error('done, total:', Object.values(results).flat().length)
