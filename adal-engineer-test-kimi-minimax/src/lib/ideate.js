// Ideation orchestrator. Single entry point: ideate({ topic?, papers?, mode }).
// Combines: (1) evidence-bundle assembly from arXiv/seed, (2) LLM call, (3) novelty
// scoring, (4) idea-star + grounding-edge construction. Returns a self-contained
// bundle the main app can splice into the live scene without rebuild.
//
// All errors flow up as typed instances from ./llm.js or ./arxiv.js. Callers
// should only catch the union of { MissingApiKeyError, LLMNetworkError,
// LLMParsedError, ArxivError }.

import { fetchPaper, paperToStar, ArxivError } from './arxiv.js'
import { generateIdeas, MissingApiKeyError, LLMNetworkError, LLMParsedError } from './llm.js'
import { scoreNovelty } from './novelty.js'

// Deterministic id from string (for reproducible idea ids without crypto).
export function stableId(prefix, str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `${prefix}-${(h >>> 0).toString(36)}`
}

// Normalise a seed-paper or fetched paper into the shape the LLM + novelty
// scorers want: { id, arxivId, title, abstract, authors, year, branch }.
export function toEvidencePaper(p) {
  return {
    id: p.id,
    arxivId: p.arxivId,
    title: p.name ?? p.title ?? '',
    abstract: p.abstract ?? '',
    authors: Array.isArray(p.authors) ? p.authors : [],
    year: p.year ?? new Date().getFullYear(),
    branch: p.branch ?? 'quantum'
  }
}

// Take a seed/known-paper star, or pull fresh arXiv metadata for an id.
async function resolvePaper(input, branchHint) {
  // If `input` is already a star with abstract → reuse as-is.
  if (input && typeof input === 'object' && input.abstract) {
    return toEvidencePaper({ ...input, branch: input.branch ?? branchHint ?? 'quantum' })
  }
  // Else assume input is an arXiv id and fetch.
  const arxivId = typeof input === 'string' ? input : input?.arxivId
  if (!arxivId) throw new ArxivError('resolvePaper: missing arxivId', { kind: 'invalid-id' })
  const paper = await fetchPaper(arxivId)
  return toEvidencePaper({ ...paper, branch: branchHint ?? paper.branch ?? 'quantum' })
}

export async function ideate({ topic = '', papers = [], mode = 'topic', starsById = null } = {}) {
  // mode: 'topic' | 'papers' | 'latest-papers'
  // `papers` may contain seed star records or arxiv-id strings.
  const evidence = []
  const unresolvedRefs = []
  for (const p of papers) {
    const refKey = typeof p === 'string' ? p : (p?.id ?? p?.arxivId ?? JSON.stringify(p))
    try {
      const ep = await resolvePaper(p, starsById?.get?.(typeof p === 'string' ? p : p?.id)?.branch)
      evidence.push(ep)
    } catch (err) {
      // Skip bad ids but continue with the rest — graceful degradation.
      // The caller surfaces per-id errors separately if it cares.
      if (err instanceof ArxivError) { unresolvedRefs.push(refKey); continue }
      throw err
    }
  }

  // If mode is 'topic' and we have no evidence, fall back to the seed papers
  // as a generic grounding set so the LLM always has *something* to riff on.
  let workingEvidence = evidence
  if (workingEvidence.length === 0 && mode === 'topic' && starsById) {
    workingEvidence = [...starsById.values()]
      .filter((s) => s.kind === 'paper')
      .slice(0, 5)
      .map(toEvidencePaper)
  }

  // EC-2/EC-4: when the user explicitly pastes refs but none resolve (network
  // down / invalid ids), we still produce an idea — but it MUST be tagged
  // `speculative` and salted with the raw refs so a deterministic mock cannot
  // collide with prior ideas and silently dedupe.
  const speculative = mode === 'papers' && evidence.length === 0 && unresolvedRefs.length > 0
  const mockSalt = speculative
    ? stableId('ref', unresolvedRefs.join('|')) // 8-char FNV hash of joined refs
    : ''

  // Call the LLM. Pass `__mockIndex` for mock determinism + `__salt` so the
  // mock generator can fold the unresolved-ref salt into the title/abstract.
  const result = await generateIdeas({
    topic,
    mode,
    papers: workingEvidence,
    __mockIndex: mockSalt ? mockSalt.charCodeAt(0) % 7 : 0,
    __salt: mockSalt,
    __speculative: speculative
  })
  const ideaRaw = result.idea

  // Score novelty.
  const groundingStars = workingEvidence
    .map((ep) => starsById?.get?.(ep.id))
    .filter(Boolean)
  const novelty = scoreNovelty({
    text: ideaRaw.abstract,
    pattern: ideaRaw.ideationPattern,
    evidence: ideaRaw.evidence,
    grounding: groundingStars
  })

  // Build a stable id (deterministic for the same title, so re-runs dedupe).
  const ideaId = stableId('idea', ideaRaw.title)

  // Build grounding edges as objects the main scene can splice in.
  const grounding = ideaRaw.evidence
    .map((e) => {
      const refId = e.from
      if (!refId) return null
      // Accept either arxiv-id-style or internal paper id.
      const matched = groundingStars.find((s) => s.arxivId === refId || s.id === refId)
      if (!matched) return null
      return { from: matched.id, to: ideaId, type: 'grounding', weight: 0.7 }
    })
    .filter(Boolean)

  // Derive a dominant branch from the grounding papers (most common).
  const branchCounts = new Map()
  for (const s of groundingStars) {
    branchCounts.set(s.branch, (branchCounts.get(s.branch) ?? 0) + 1)
  }
  const dominantBranch = [...branchCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'quantum'

  const ideaStar = {
    id: ideaId,
    kind: 'idea',
    name: ideaRaw.title,
    summary: ideaRaw.summary,
    abstract: ideaRaw.abstract,
    ideationPattern: ideaRaw.ideationPattern,
    novelty,
    evidence: ideaRaw.evidence,
    generatedFrom: grounding.map((g) => g.from),
    branch: dominantBranch,
    year: new Date().getFullYear(),
    influence: 2,
    frontier: true,
    scaleExp: 0,
    speculative,           // true only when EP3 saw pasted refs but none resolved
    pos: null              // filled by main.js (position step)
  }

  return {
    ideaStar,
    groundingEdges: grounding,
    transport: result.transport,
    speculative,
    unresolvedRefs,
    requestedRefs: papers.length,
    noveltyBreakdown: scoreNovelty({
      text: ideaRaw.abstract,
      pattern: ideaRaw.ideationPattern,
      evidence: ideaRaw.evidence,
      grounding: groundingStars,
      returnParts: true
    }).parts
  }
}

// Re-export so callers only need to import from one place.
export { MissingApiKeyError, LLMNetworkError, LLMParsedError } from './llm.js'
export { ArxivError } from './arxiv.js'
