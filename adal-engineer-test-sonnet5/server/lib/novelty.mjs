// Novelty scoring — operationalizes both reference papers rather than
// asking the LLM to self-rate:
//  - ResearchStudio-Idea (2607.04439): novelty should account for prior-art
//    collision (max similarity to any existing paper).
//  - Measuring the Gap (2607.01233): LLM ideas over-concentrate on
//    "bridge"/"synthesis" opportunity patterns — an idea in an
//    over-represented cluster should score lower than one exploring a rarer
//    pattern, even at equal semantic distance from prior art.
import { similarity } from './embeddings.mjs'

const SEMANTIC_WEIGHT = 0.65
const DIVERSITY_WEIGHT = 0.35
const OVERUSED_PATTERNS = new Set(['bridge', 'synthesis'])
const OVERUSED_PENALTY = 0.18

// existingPapers: all paper nodes to check collision against
// existingIdeas: previously generated idea nodes (for paradigm-diversity term)
export function scoreNovelty(idea, existingPapers, existingIdeas = []) {
  // (a) semantic distance from prior art: 1 - max similarity to any paper
  let maxSim = 0
  let comparedAgainst = null
  existingPapers.forEach((paper) => {
    const { score } = similarity(idea, paper)
    if (score > maxSim) {
      maxSim = score
      comparedAgainst = paper
    }
  })
  const semanticNovelty = 1 - maxSim

  // (b) paradigm-diversity bonus/penalty: how represented is this idea's
  // opportunityPattern among existing generated ideas?
  const patternCounts = new Map()
  existingIdeas.forEach((i) => {
    const key = i.opportunityPattern || 'unknown'
    patternCounts.set(key, (patternCounts.get(key) ?? 0) + 1)
  })
  const totalIdeas = Math.max(existingIdeas.length, 1)
  const thisPatternCount = patternCounts.get(idea.opportunityPattern) ?? 0
  const representation = thisPatternCount / totalIdeas // 0 = never seen before, 1 = only pattern seen
  let diversityTerm = 1 - representation // under-represented → higher score
  if (OVERUSED_PATTERNS.has(idea.opportunityPattern)) {
    diversityTerm = Math.max(0, diversityTerm - OVERUSED_PENALTY)
  }

  const raw = SEMANTIC_WEIGHT * semanticNovelty + DIVERSITY_WEIGHT * diversityTerm
  const score = Math.max(0, Math.min(1, raw))

  const closestTitle = comparedAgainst?.title ?? 'no closely related paper found'
  const overusedNote = OVERUSED_PATTERNS.has(idea.opportunityPattern)
    ? ` This idea's opportunity pattern ("${idea.opportunityPattern}") is one the human-vs-LLM research gap literature (arXiv:2607.01233) flags as over-produced by LLMs, which slightly discounts its score.`
    : ''
  const rationale =
    `Semantic distance from closest prior art ("${closestTitle}") contributes ` +
    `${(semanticNovelty * 100).toFixed(0)}% originality (similarity=${maxSim.toFixed(2)}). ` +
    `Opportunity pattern "${idea.opportunityPattern}" appears in ${(representation * 100).toFixed(0)}% ` +
    `of ideas generated so far.${overusedNote}`

  return {
    noveltyScore: Number(score.toFixed(3)),
    noveltyRationale: rationale,
    closestPriorArt: comparedAgainst?.id ?? null,
    maxSimilarity: Number(maxSim.toFixed(3))
  }
}
