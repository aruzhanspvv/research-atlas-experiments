// Offline seed script: fetches a REAL batch of ~20-30 papers from arXiv
// across several topic clusters (SEED_QUERIES), embeds them (if a key is
// configured; otherwise leaves embedding null and downstream similarity
// falls back to Jaccard), computes similarity edges, lays out positions,
// and writes src/data/nodes.json + src/data/edges.json.
//
// This satisfies the contract requirement that the map is populated by
// REAL fetched papers by default, not placeholders, and not the
// empty-until-tour idle state of the deepfield reference.
//
// Run: npm run seed   (safe to re-run; dedupes by id against existing file)
import 'dotenv/config'
import { searchArxiv, fetchArxivById, SEED_QUERIES } from '../server/lib/sources/arxiv.mjs'
import { embedText, hasEmbeddingProvider } from '../server/lib/embeddings.mjs'
import { computeAllSimilarEdges } from '../server/lib/edgeCompute.mjs'
import { computeTopics } from '../src/data/topics.js'
import { saveNodes, saveEdges, loadNodes } from '../server/lib/store.mjs'
import { mulberry32 } from '../src/utils/prng.js'

const REFERENCE_PAPER_IDS = ['2607.04439', '2607.01233'] // the two grounding papers from PLAN.md — always included

function hashString(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

async function main() {
  console.log('[seed] fetching reference grounding papers...')
  const referencePapers = []
  for (const id of REFERENCE_PAPER_IDS) {
    try {
      const p = await fetchArxivById(id)
      if (p) {
        p.topics = ['research-ideation']
        referencePapers.push(p)
      }
    } catch (err) {
      console.warn(`[seed] failed to fetch reference paper ${id}:`, err.message)
    }
  }

  console.log('[seed] fetching seed queries across topic clusters...')
  const collected = [...referencePapers]
  for (const { query, topic, count } of SEED_QUERIES) {
    try {
      const results = await searchArxiv(query, count)
      results.forEach((r) => {
        r.topics = [topic, ...(r.topics ?? [])].slice(0, 3)
      })
      collected.push(...results)
      console.log(`[seed]   "${query}" -> ${results.length} papers`)
    } catch (err) {
      console.warn(`[seed] query "${query}" failed:`, err.message)
    }
  }

  // Dedupe by id, keep first occurrence (reference papers win over search hits).
  const seen = new Set()
  const nodes = []
  collected.forEach((n) => {
    if (seen.has(n.id)) return
    seen.add(n.id)
    nodes.push(n)
  })
  console.log(`[seed] ${nodes.length} unique papers collected`)

  if (hasEmbeddingProvider()) {
    console.log('[seed] computing embeddings...')
    for (const n of nodes) {
      n.embedding = await embedText(`${n.title} ${n.abstract}`)
    }
  } else {
    console.log('[seed] no OPENAI_API_KEY set — skipping embeddings, edges will use keyword-Jaccard fallback')
  }

  console.log('[seed] computing topic anchors...')
  const { meta } = computeTopics(nodes, 10)

  console.log('[seed] laying out positions (deterministic anchor + jitter)...')
  // Bug A fix: previously fell back to [0, 0, 0] (world origin) whenever a
  // node's primary topic wasn't among the top-10 anchored topics — every
  // such node then rendered at/near the camera's default look-at point,
  // reading as "random dots in the center." Mirrors the same fix applied
  // to server/lib/placement.mjs (live-generation path) for consistency.
  const FALLBACK_RING_RADIUS = 980
  function fallbackAnchorForTopic(topic) {
    const rand = mulberry32(hashString(`fallback-anchor:${topic}`))
    const angle = rand() * Math.PI * 2
    const y = (rand() - 0.5) * 90
    return [Math.cos(angle) * FALLBACK_RING_RADIUS, y, Math.sin(angle) * FALLBACK_RING_RADIUS]
  }
  nodes.forEach((n) => {
    const rand = mulberry32(hashString(n.id))
    const primaryTopic = (n.topics ?? [])[0]
    const anchorMeta = primaryTopic ? meta.get(primaryTopic) : null
    const anchor = anchorMeta ? anchorMeta.anchor : primaryTopic ? fallbackAnchorForTopic(primaryTopic) : [0, 0, 0]
    const gauss = () => {
      const u = Math.max(rand(), 1e-9)
      const v = rand()
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    }
    const galaxy = [
      anchor[0] + gauss() * 140,
      anchor[1] + gauss() * 50,
      anchor[2] + gauss() * 140
    ]
    const year = n.year ?? 2024
    const timeline = [(year - 2020) * 3.2 + gauss() * 20, gauss() * 25, gauss() * 40]
    const scale = [(n.influence ?? 1) * 60, gauss() * 24, gauss() * 40]
    n.pos = { galaxy, timeline, scale }
  })

  console.log('[seed] computing similarity edges...')
  const edges = computeAllSimilarEdges(nodes)
  console.log(`[seed] ${edges.length} similarity edges computed`)

  await saveNodes(nodes)
  await saveEdges(edges)
  console.log(`[seed] wrote ${nodes.length} nodes and ${edges.length} edges to src/data/`)
}

main().catch((err) => {
  console.error('[seed] fatal error:', err)
  process.exitCode = 1
})
