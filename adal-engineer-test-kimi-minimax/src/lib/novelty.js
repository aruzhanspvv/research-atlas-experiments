// Novelty score — the headline numeric that lives on every idea-star and in
// every idea-card. Conceived to match the methodology described in
// docs/METHODOLOGY.md and grounded in two arXiv references:
//
//   arXiv:2607.04439  ResearchStudio-Idea — IdeaSpark framework
//                     (15 patterns, evidence-readiness, Scoop-Check collision)
//   arXiv:2607.01233  Measuring the Gap Between Human and LLM Research Ideas
//                     (opportunity-pattern × research-paradigm 2-axis taste
//                     taxonomy; finding that LLMs over-cluster on bridge + synthesis)
//
// Formula (0–100):
//
//   novelty = round(100 * (
//       0.50 * d_jaccard                                  // distance from grounding papers
//     + 0.20 * (1 - exp(-E / 5))                          // evidence coverage
//     + 0.15 * opportunityWeight(pattern.opportunity)     // penalise bridge over-cluster
//     + 0.15 * paradigmWeight(pattern.paradigm)           // penalise synthesis over-cluster
//   ))
//
//   d_jaccard ∈ [0, 1]: mean pairwise Jaccard distance between the idea's top-K
//                       keywords and each grounding paper's top-K keywords.
//   E: number of supporting evidence quotes (capped at 10 for the formula).
//
// All terms are clamped to safe ranges — no NaN possible at novelty = 0 or 100.

import PATTERNS from '../data/ideation-patterns.json'

const OPPORTUNITY_WEIGHTS = PATTERNS.opportunityWeights
const PARADIGM_WEIGHTS = PATTERNS.paradigmWeights
const PATTERN_BY_ID = new Map(PATTERNS.patterns.map((p) => [p.id, p]))

const STOPWORDS = new Set(
  ('a an the and or of to in on for with by from as is are was were be been being it its this that these those at into about over under between across through via using used use we our their there here such also may can could should would one two three many much more most some any all not no nor only own same so than too very just into onto upon within without among but if then else when while where why how what which who whom whose — – — ' +
   // Math/CS noise common in abstracts
   'paper work show results method approach model data set based proposed new novel proposed study analysis case time number order given using proposed results show paper work proposed new method model approach based using data set analysis case results paper study approach using'
  ).split(/\s+/)
)

const TOKEN_RE = /[A-Za-z][A-Za-z\-]+/g

// Extract top-K keywords from text using simple TF (after stopword + length filter).
export function topKeywords(text, k = 20) {
  if (typeof text !== 'string') return []
  const counts = new Map()
  for (const m of text.toLowerCase().matchAll(TOKEN_RE)) {
    const w = m[0]
    if (w.length < 4) continue
    if (STOPWORDS.has(w)) continue
    counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([w]) => w)
}

// Jaccard distance between two keyword sets: 1 - |A∩B| / |A∪B|.
export function jaccardDistance(a, b) {
  if (!a?.length && !b?.length) return 0
  const A = new Set(a)
  const B = new Set(b)
  let inter = 0
  for (const w of A) if (B.has(w)) inter += 1
  const union = A.size + B.size - inter
  if (union === 0) return 0
  return 1 - inter / union
}

// Look up a pattern id in the catalog; returns the entry or { opportunity: 'gap', paradigm: 'novel-mechanism' } default.
function resolvePattern(patternId) {
  return PATTERN_BY_ID.get(patternId) ?? { opportunity: 'gap', paradigm: 'novel-mechanism' }
}

// Main entry. `inputs`:
//   text:       idea abstract / summary string
//   pattern:    one of the 15 pattern ids (optional; defaults to a safe middle)
//   evidence:   array of { quote, from } (length → coverage term)
//   grounding:  array of paper star-records whose abstracts we compare against
//   returnParts: boolean — if true, return { score, parts } for transparency
//
// All inputs are forgiving: missing pieces default sensibly rather than throwing.
export function scoreNovelty(inputs = {}) {
  const text = inputs.text ?? ''
  const pattern = resolvePattern(inputs.pattern)
  const evidence = Array.isArray(inputs.evidence) ? inputs.evidence.slice(0, 10) : []
  const grounding = Array.isArray(inputs.grounding) ? inputs.grounding : []
  const returnParts = !!inputs.returnParts

  const ideaKw = topKeywords(text, 20)

  // Mean Jaccard distance to grounding papers. If no grounding, fall back to 0.5
  // (a "neutral" distance — neither too close nor too far).
  let d = 0.5
  if (grounding.length > 0 && ideaKw.length > 0) {
    let sum = 0
    let n = 0
    for (const g of grounding) {
      const gKw = topKeywords(g?.abstract ?? g?.title ?? '', 20)
      if (gKw.length === 0) continue
      sum += jaccardDistance(ideaKw, gKw)
      n += 1
    }
    if (n > 0) d = sum / n
  }
  // Clamp [0,1] defensively
  d = Math.min(1, Math.max(0, d))

  // Evidence coverage (saturating curve)
  const E = evidence.length
  const coverage = 1 - Math.exp(-E / 5)
  const covClamped = Math.min(1, Math.max(0, coverage))

  const opW = OPPORTUNITY_WEIGHTS[pattern.opportunity] ?? 0.7
  const parW = PARADIGM_WEIGHTS[pattern.paradigm] ?? 0.7
  // Defensive clamp on weights (catalog values are pre-vetted, but a bad future
  // pattern entry should not blow the score).
  const opWc = Math.min(1, Math.max(0, opW))
  const parWc = Math.min(1, Math.max(0, parW))

  const raw = 0.5 * d + 0.2 * covClamped + 0.15 * opWc + 0.15 * parWc
  const score = Math.round(Math.min(1, Math.max(0, raw)) * 100)

  if (!returnParts) return score

  // Sub-components normalised to 0..1 for the panel gauge / methodology readout.
  return {
    score,
    parts: {
      distance: d,
      coverage: covClamped,
      opportunity: opWc,
      paradigm: parWc,
      evidenceCount: E
    }
  }
}

// Map an opportunity-pattern id to the four deepfield-palette ring hues.
// All four sit inside the cool deep-space / additive-blend family — no candy colours.
export const OPPORTUNITY_HUE = Object.freeze({
  bridge:    '#ff8b66',  // warm coral
  gap:       '#5db4ff',  // cool blue
  limit:     '#b78dff',  // soft violet
  reframing: '#e9c97a'   // muted gold
})

// Paradigm → pulse rhythm multiplier (drives the idea-star shader pulse rate).
export const PARADIGM_PULSE = Object.freeze({
  synthesis:       1.0,
  extension:       0.7,
  'novel-mechanism': 1.6,
  'new-domain':    1.3
})

// Novelty 0..100 → ring radius scalar (in shader units). Inverted: small ring = novel.
export function ringRadius(novelty) {
  const n = Math.min(100, Math.max(0, novelty)) / 100
  // Map novelty 1.0 → small ring (radius ≈ 1.7), novelty 0.0 → big ring (radius ≈ 4.5)
  return 4.5 - 2.8 * n
}

// Novelty 0..100 → inner-dot brightness multiplier. Higher novelty = brighter.
export function innerBrightness(novelty) {
  const n = Math.min(100, Math.max(0, novelty)) / 100
  return 0.45 + 0.55 * n
}

// Convenience: aggregate human-readable breakdown for the card panel.
export function noveltyBreakdown(inputs) {
  const r = scoreNovelty({ ...inputs, returnParts: true })
  return r
}
