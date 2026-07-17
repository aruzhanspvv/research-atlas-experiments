import express from 'express'
import { generateIdeas, hasLlmProvider } from '../lib/ideation.mjs'
import { scoreNovelty } from '../lib/novelty.mjs'
import { embedText, hasEmbeddingProvider, similarity } from '../lib/embeddings.mjs'
import { loadNodes, appendNodesAndEdges } from '../lib/store.mjs'
import { groundedInEdges, similarEdgesFor } from '../lib/edgeCompute.mjs'
import { computeTopics } from '../../src/data/topics.js'
import { placeNode } from '../lib/placement.mjs'
import { extractArxivId, fetchArxivById } from '../lib/sources/arxiv.mjs'

const router = express.Router()

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40)
}

// POST /api/generate
// Body: { mode: 'topic', topic: string } | { mode: 'papers', paperRefs: string[] }
// paperRefs may be existing node ids, arXiv IDs/URLs, or free-text titles
// (resolved the same way as /api/reference).
router.post('/generate', async (req, res) => {
  const { mode, topic, paperRefs } = req.body ?? {}

  // —— Edge cases C2/C3: validate input before attempting generation ——
  if (mode !== 'topic' && mode !== 'papers') {
    return res.status(400).json({ error: 'INVALID_MODE', message: 'mode must be "topic" or "papers"' })
  }
  if (mode === 'topic' && (!topic || !topic.trim())) {
    return res.status(400).json({ error: 'EMPTY_TOPIC', message: 'Please enter a research topic before generating ideas.' })
  }
  if (mode === 'papers' && (!Array.isArray(paperRefs) || paperRefs.length === 0)) {
    return res.status(400).json({ error: 'EMPTY_REFERENCES', message: 'Please provide at least one paper reference (arXiv ID, URL, or title).' })
  }

  if (!hasLlmProvider()) {
    return res.status(503).json({
      error: 'NO_LLM_PROVIDER',
      message: 'Idea generation requires an LLM API key. Set OPENAI_API_KEY in server/.env and restart the server. See README for setup.'
    })
  }

  try {
    const existingNodes = await loadNodes()
    const existingPapers = existingNodes.filter((n) => n.type === 'paper')
    const existingIdeas = existingNodes.filter((n) => n.type === 'idea')

    // —— Resolve evidence bundle ——
    let evidence = []
    if (mode === 'papers') {
      const resolveErrors = []
      for (const ref of paperRefs) {
        const trimmed = String(ref).trim()
        if (!trimmed) continue
        // Already an existing node id?
        const existing = existingNodes.find((n) => n.id === trimmed || n.sourceUrl === trimmed)
        if (existing) {
          evidence.push(existing)
          continue
        }
        const arxivId = extractArxivId(trimmed)
        if (arxivId) {
          const paper = await fetchArxivById(arxivId)
          if (paper) evidence.push(paper)
          else resolveErrors.push(`Could not resolve arXiv ID "${arxivId}"`)
        } else {
          resolveErrors.push(`"${trimmed}" is not a recognized arXiv ID/URL and no matching existing node was found. Try pasting an arXiv ID (e.g. 2607.04439) or URL.`)
        }
      }
      if (evidence.length === 0) {
        return res.status(400).json({
          error: 'INVALID_REFERENCE',
          message: resolveErrors.join(' ') || 'None of the provided references could be resolved.'
        })
      }
    } else {
      // mode === 'topic': seed evidence with top-K nearest existing papers
      // by similarity to the topic string (embedding search with Jaccard
      // fallback), per PLAN.md §3. If nothing is close enough, we still
      // proceed — arXiv is queried as a live fallback grounding source
      // (edge case C4: zero related papers found for a topic).
      const topicProxy = { title: topic, abstract: topic }
      const ranked = existingPapers
        .map((p) => ({ p, score: similarity(topicProxy, p).score }))
        .sort((a, b) => b.score - a.score)
      evidence = ranked.filter((r) => r.score > 0.05).slice(0, 5).map((r) => r.p)

      if (evidence.length === 0) {
        // C4: no related papers found locally — try a live arXiv search as
        // an evidence fallback rather than erroring out.
        try {
          const { searchArxiv } = await import('../lib/sources/arxiv.mjs')
          const live = await searchArxiv(topic, 4)
          evidence = live
        } catch (err) {
          console.warn('[generate] live arXiv fallback for topic evidence failed:', err.message)
        }
      }
      if (evidence.length === 0) {
        return res.status(200).json({
          ideas: [],
          exploratory: true,
          message: `No related papers were found for "${topic}" locally or on arXiv. Try a broader or differently-worded topic.`
        })
      }
    }

    // —— Generate (real LLM call — no template fallback) ——
    const rawIdeas = await generateIdeas({ evidence, mode, topic })
    if (!rawIdeas || rawIdeas.length === 0) {
      return res.status(502).json({ error: 'GENERATION_EMPTY', message: 'The LLM returned no ideas. Please try again.' })
    }

    // —— Persist as idea nodes with novelty score + edges ——
    const { meta } = computeTopics([...existingNodes], 10)
    const pool = [...existingNodes]
    const newNodes = []
    const newEdges = []
    const runningIdeas = [...existingIdeas]

    for (const raw of rawIdeas) {
      const id = `idea:${slugify(raw.title)}-${Math.random().toString(36).slice(2, 7)}`
      const idea = {
        id,
        type: 'idea',
        title: raw.title,
        summary: raw.summary,
        fullText: raw.fullText,
        generatedFrom: raw.generatedFrom,
        generationMethod: mode,
        ideationPattern: raw.ideationPattern,
        opportunityPattern: raw.opportunityPattern,
        researchParadigm: raw.researchParadigm,
        differentiation: raw.differentiation,
        topics: evidence[0]?.topics?.slice(0, 2) ?? [],
        createdAt: new Date().toISOString()
      }

      if (hasEmbeddingProvider()) {
        idea.embedding = await embedText(`${idea.title} ${idea.summary}`)
      }

      const { noveltyScore, noveltyRationale, closestPriorArt, maxSimilarity } = scoreNovelty(
        idea,
        existingPapers,
        runningIdeas
      )
      idea.noveltyScore = noveltyScore
      idea.noveltyRationale = noveltyRationale
      idea.closestPriorArt = closestPriorArt
      idea.maxSimilarity = maxSimilarity

      idea.pos = placeNode(idea, pool, meta)

      newNodes.push(idea)
      newEdges.push(...groundedInEdges(idea))
      newEdges.push(...similarEdgesFor(idea, pool))
      pool.push(idea)
      runningIdeas.push(idea)
    }

    const { nodes } = await appendNodesAndEdges(newNodes, newEdges)
    res.json({ ideas: newNodes, edges: newEdges, totalNodes: nodes.length })
  } catch (err) {
    console.error('[generateIdeas] error:', err.message)
    if (err.message?.startsWith('NO_LLM_PROVIDER')) {
      return res.status(503).json({ error: 'NO_LLM_PROVIDER', message: err.message })
    }
    // Bug #1 fix: outbound calls (arXiv, LLM) now time out instead of
    // hanging indefinitely — surface that distinctly as a 504 rather than
    // a generic 502, so the client can tell "upstream too slow" apart from
    // "upstream returned an error".
    if (err.isTimeout) {
      return res.status(504).json({ error: 'SOURCE_TIMEOUT', message: err.message })
    }
    res.status(502).json({ error: 'GENERATION_FAILED', message: err.message })
  }
})

export default router
