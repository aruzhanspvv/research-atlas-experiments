import express from 'express'
import { searchArxiv, extractArxivId, fetchArxivById } from '../lib/sources/arxiv.mjs'
import { fetchHfDailyPapers } from '../lib/sources/hfDaily.mjs'
import { fetchXPapers } from '../lib/sources/x.mjs'
import { embedText, hasEmbeddingProvider } from '../lib/embeddings.mjs'
import { loadNodes, loadEdges, appendNodesAndEdges } from '../lib/store.mjs'
import { similarEdgesFor } from '../lib/edgeCompute.mjs'
import { computeTopics } from '../../src/data/topics.js'
import { placeNode } from '../lib/placement.mjs'

const router = express.Router()

// GET /api/fetch?source=arxiv&query=...  — search a single source (used by
// the "add reference" UI flow to resolve a free-text paper search).
router.get('/fetch', async (req, res) => {
  const { source = 'arxiv', query } = req.query
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'query parameter is required' })
  }
  try {
    let results = []
    if (source === 'arxiv') results = await searchArxiv(query, 8)
    else if (source === 'hf-daily') results = await fetchHfDailyPapers(8)
    else if (source === 'x') results = await fetchXPapers()
    else return res.status(400).json({ error: 'INVALID_SOURCE', message: `unknown source "${source}"` })
    res.json({ results })
  } catch (err) {
    console.error('[fetchPapers] /fetch error:', err.message)
    if (err.isTimeout) {
      return res.status(504).json({ error: 'SOURCE_TIMEOUT', message: err.message })
    }
    res.status(502).json({ error: 'SOURCE_UNAVAILABLE', message: err.message })
  }
})

// POST /api/reference  { input: "arXiv id, URL, or free-text title" }
// Resolves a single paper reference for UC3 ("user provides paper(s)").
// Adds it to nodes.json if not already present.
router.post('/reference', async (req, res) => {
  const { input } = req.body ?? {}
  if (!input || !input.trim()) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'A paper reference (arXiv ID, URL, or title) is required.' })
  }
  try {
    const arxivId = extractArxivId(input)
    let paper = null
    if (arxivId) {
      paper = await fetchArxivById(arxivId)
      if (!paper) {
        return res.status(404).json({ error: 'NOT_FOUND', message: `No arXiv paper found for ID "${arxivId}".` })
      }
    } else {
      // Free-text title/topic-ish input: search arXiv as a best-effort resolve.
      const results = await searchArxiv(input, 1)
      if (results.length === 0) {
        return res.status(404).json({ error: 'NOT_FOUND', message: `Could not resolve "${input}" to a paper. Try an arXiv ID or URL.` })
      }
      paper = results[0]
    }

    const [existingNodes] = await Promise.all([loadNodes()])
    const already = existingNodes.find((n) => n.id === paper.id)
    if (already) {
      return res.json({ paper: already, added: false })
    }

    if (hasEmbeddingProvider()) {
      paper.embedding = await embedText(`${paper.title} ${paper.abstract}`)
    }
    const { meta } = computeTopics(existingNodes, 10)
    paper.pos = placeNode(paper, existingNodes, meta)
    const newEdges = similarEdgesFor(paper, existingNodes)

    const { nodes } = await appendNodesAndEdges([paper], newEdges)
    res.json({ paper, added: true, totalNodes: nodes.length })
  } catch (err) {
    console.error('[fetchPapers] /reference error:', err.message)
    if (err.isTimeout) {
      return res.status(504).json({ error: 'SOURCE_TIMEOUT', message: err.message })
    }
    res.status(502).json({ error: 'RESOLVE_FAILED', message: err.message })
  }
})

// POST /api/refresh — best-effort auto-research pass (UC1): pulls from
// arXiv (hard requirement) + HF Daily Papers (best-effort) + X (stub),
// dedupes, embeds, computes similarity edges, and persists. This is an
// on-demand batch job, not something run per-visitor.
router.post('/refresh', async (req, res) => {
  const { queries = [] } = req.body ?? {}
  const sourcesAttempted = []
  const sourcesSucceeded = []
  const collected = []

  try {
    if (queries.length > 0) {
      for (const q of queries) {
        sourcesAttempted.push(`arxiv:${q}`)
        try {
          const results = await searchArxiv(q, 5)
          collected.push(...results)
          sourcesSucceeded.push(`arxiv:${q}`)
        } catch (err) {
          console.warn(`[refresh] arxiv query "${q}" failed:`, err.message)
        }
      }
    }

    sourcesAttempted.push('hf-daily')
    const hf = await fetchHfDailyPapers(6)
    if (hf.length > 0) sourcesSucceeded.push('hf-daily')
    collected.push(...hf)

    sourcesAttempted.push('x')
    const x = await fetchXPapers()
    if (x.length > 0) sourcesSucceeded.push('x')
    collected.push(...x)

    const existingNodes = await loadNodes()
    const existingIds = new Set(existingNodes.map((n) => n.id))
    const fresh = collected.filter((n) => !existingIds.has(n.id))

    // Embed (if provider configured) + place + similarity-edge each new paper.
    const { meta } = computeTopics([...existingNodes, ...fresh], 10)
    const pool = [...existingNodes]
    const allNewEdges = []
    for (const paper of fresh) {
      if (hasEmbeddingProvider()) {
        paper.embedding = await embedText(`${paper.title} ${paper.abstract}`)
      }
      paper.pos = placeNode(paper, pool, meta)
      allNewEdges.push(...similarEdgesFor(paper, pool))
      pool.push(paper)
    }

    const { nodes } = await appendNodesAndEdges(fresh, allNewEdges)
    res.json({
      addedCount: fresh.length,
      totalNodes: nodes.length,
      sourcesAttempted,
      sourcesSucceeded
    })
  } catch (err) {
    console.error('[fetchPapers] /refresh error:', err.message)
    if (err.isTimeout) {
      return res.status(504).json({ error: 'SOURCE_TIMEOUT', message: err.message, sourcesAttempted, sourcesSucceeded })
    }
    res.status(502).json({ error: 'REFRESH_FAILED', message: err.message, sourcesAttempted, sourcesSucceeded })
  }
})

export default router
