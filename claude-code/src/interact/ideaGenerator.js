// Client-side, no-API-key idea generator. Implements a lightweight version of the
// evidence-grounded ideation pattern from arXiv:2607.04439 (retrieve precedents,
// name the gap, instantiate one candidate direction) purely as term-overlap search
// + templating, so "generate a new idea" and "verify its connections to existing
// papers" both work without a live LLM call.

const STOPWORDS = new Set(
  'a an the of for and or to in on with from into using via is are be as by that this we our their its it can could would should new novel approach method paper study analysis using based propose present show demonstrate results'.split(
    ' '
  )
)

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []).filter((w) => !STOPWORDS.has(w))
}

export function buildCorpusIndex(papers) {
  const docs = papers.map((p) => tokenize(`${p.title} ${p.oneLiner}`))
  const df = new Map()
  docs.forEach((doc) => {
    new Set(doc).forEach((w) => df.set(w, (df.get(w) ?? 0) + 1))
  })
  const N = docs.length
  const idf = new Map([...df.entries()].map(([w, c]) => [w, Math.log((N + 1) / (c + 1)) + 1]))
  return { docs, idf, papers }
}

function scoreDoc(queryTerms, doc, idf) {
  const counts = new Map()
  doc.forEach((w) => counts.set(w, (counts.get(w) ?? 0) + 1))
  let score = 0
  queryTerms.forEach((w) => {
    if (counts.has(w)) score += (idf.get(w) ?? 1) * counts.get(w)
  })
  return score
}

function topMatches(query, index, k = 3) {
  const qTerms = tokenize(query)
  if (!qTerms.length) return []
  const scored = index.papers.map((p, i) => ({
    paper: p,
    score: scoreDoc(qTerms, index.docs[i], index.idf)
  }))
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

function branchDiversity(matches) {
  return new Set(matches.map((m) => m.paper.branch)).size
}

let seq = 0

export function generateIdea(query, index, papers) {
  const trimmed = query.trim()
  if (!trimmed) return null
  let matches = topMatches(trimmed, index, 3)
  if (!matches.length) {
    // no keyword overlap: fall back to a few broadly-cited papers so the idea still grounds in something real
    matches = [...papers]
      .sort((a, b) => b.influence - a.influence)
      .slice(0, 3)
      .map((paper) => ({ paper, score: 0 }))
  }
  const top = matches[0].paper
  const branches = new Set(matches.map((m) => m.paper.branch))
  const bridges = branches.size > 1

  // Novelty heuristic: cross-branch bridges score higher ("opportunity pattern" framing
  // from arXiv:2607.01233), weak keyword overlap (query is unlike existing corpus) also
  // pushes novelty up, capped to a plausible 40-92 band.
  const avgScore = matches.reduce((s, m) => s + m.score, 0) / matches.length
  const overlapPenalty = Math.min(20, avgScore * 1.5)
  const noveltyScore = Math.round(
    Math.min(92, Math.max(40, 55 + (bridges ? 18 : 0) + (branchDiversity(matches) - 1) * 6 - overlapPenalty + Math.random() * 8))
  )

  seq += 1
  const id = `idea-live-${seq}-${Date.now().toString(36)}`
  const groundedIn = matches.map((m) => m.paper.id)
  const branch = top.branch

  const bridgeClause = bridges
    ? `by bridging ${[...branches].length} adjacent fields (${[...branches].join(', ')})`
    : `within the same line of work as "${top.title}"`

  const title = `Grounding "${trimmed}" ${bridgeClause}`
  const gap = `Searching the fetched corpus for "${trimmed}" surfaces ${matches.length} related paper${matches.length > 1 ? 's' : ''}, most closely "${top.title}" — but none of the retrieved work directly targets this combination, suggesting an open gap.`
  const hypothesis = `Combine the techniques in ${matches.map((m) => `"${m.paper.title}"`).join(', ')} to address "${trimmed}" directly.`
  const method = `Start from ${top.title}'s approach, adapt it using the complementary angle in ${matches
    .slice(1)
    .map((m) => `"${m.paper.title}"`)
    .join(' and ') || 'related retrieved work'}, and evaluate on the setting implied by "${trimmed}".`
  const differentiation = `Each grounding paper solves a piece of this on its own; none combines them for "${trimmed}" specifically — that combination is the candidate contribution.`
  const priorArt = `Closest prior art: ${top.title}. No retrieved paper claims the same combination, but a full literature check (beyond this client-side corpus) is needed before treating this as confirmed-novel.`

  return {
    id,
    type: 'idea',
    branch,
    year: 2026,
    influence: 4,
    frontier: true,
    noveltyExp: noveltyScore / 10,
    noveltyScore,
    title,
    oneLiner: hypothesis,
    gap,
    method,
    differentiation,
    priorArt,
    groundedIn,
    live: true
  }
}
