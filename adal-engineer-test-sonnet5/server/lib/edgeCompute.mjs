// Shared edge-computation logic for both the offline seed/refresh script
// and live idea-generation requests. Two edge types:
//  - "grounded-in": idea -> source paper(s), always added directly from
//    generatedFrom, no threshold (this is the evidence trail, not a guess).
//  - "similar": paper<->paper / idea<->idea / idea<->paper, added when
//    cosine (or Jaccard fallback) similarity exceeds a threshold, capped to
//    top-K neighbors per node so the graph stays a constellation, not a
//    hairball.
import { similarity } from './embeddings.mjs'

// Jaccard scores run much lower than cosine similarity (empirically, top
// scores across a real 27-paper arXiv seed set topped out at ~0.16, median
// ~0.04) — tuned against that distribution so top-K neighbors still surface
// meaningful (non-noise) connections. Cosine similarity (when an embedding
// provider is configured) naturally produces higher scores and still clears
// this bar easily.
const SIMILARITY_THRESHOLD = 0.06
const TOP_K_NEIGHBORS = 4

export function groundedInEdges(idea) {
  return (idea.generatedFrom ?? []).map((paperId) => ({
    from: idea.id,
    to: paperId,
    type: 'grounded-in',
    weight: 0.9
  }))
}

// Computes top-K "similar" edges from `node` against `pool` (existing nodes,
// excluding itself). Deterministic given fixed embeddings/text — same input
// produces the same edge set on repeated runs (E2 in EVAL_PLAN).
export function similarEdgesFor(node, pool) {
  const scored = pool
    .filter((other) => other.id !== node.id)
    .map((other) => {
      const { score } = similarity(node, other)
      return { other, score }
    })
    .filter((s) => s.score >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K_NEIGHBORS)

  return scored.map(({ other, score }) => ({
    from: node.id,
    to: other.id,
    type: 'similar',
    weight: Number(score.toFixed(3))
  }))
}

// Full pairwise similarity pass over a node set (used by the offline
// seed/compute-edges tool, not per-request — O(n^2) is fine for tens of
// nodes, not meant for thousands).
export function computeAllSimilarEdges(nodes) {
  const edges = []
  const seen = new Set()
  nodes.forEach((node) => {
    similarEdgesFor(node, nodes).forEach((edge) => {
      const key = [edge.from, edge.to].sort().join('::')
      if (seen.has(key)) return
      seen.add(key)
      edges.push(edge)
    })
  })
  return edges
}
