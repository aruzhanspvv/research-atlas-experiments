// Merges papers.raw.json + ideas.raw.json (+ evaluator scores, if present)
// into the final src/data/{papers,ideas,edges}.json consumed by the app.
// Papers scatter around their source's nebula anchor; each idea is pulled
// toward the centroid of the papers that ground it (so grounding edges read
// as short, legible arcs) blended with the shared "idea" anchor so the idea
// cluster still reads as its own region.
import { readFile, writeFile } from 'node:fs/promises'
import { BRANCHES } from '../src/data/sources.js'

function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))
  } catch {
    return fallback
  }
}

async function main() {
  const papersRaw = await readJson('../src/data/papers.raw.json', [])
  const ideasRaw = await readJson('../src/data/ideas.raw.json', { ideas: [], ideaEdges: [] })
  const evalRaw = await readJson('../src/data/eval.raw.json', { scores: [] })
  const scoreById = new Map(evalRaw.scores.map((s) => [s.id, s]))

  const rand = mulberry32(20260716)
  const gauss = () => {
    const u = Math.max(rand(), 1e-9)
    const v = rand()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  const papers = papersRaw.map((p) => {
    const anchor = BRANCHES[p.source]?.anchor ?? [0, 0, 0]
    const pos = [
      anchor[0] + gauss() * 220,
      anchor[1] + gauss() * 90,
      anchor[2] + gauss() * 220
    ]
    return { ...p, branch: p.source, pos }
  })
  const paperById = new Map(papers.map((p) => [p.id, p]))
  const ideaAnchor = BRANCHES.idea.anchor

  const ideas = ideasRaw.ideas.map((idea) => {
    const grounding = (idea.groundedIn || []).map((id) => paperById.get(id)).filter(Boolean)
    const centroid = grounding.length
      ? grounding.reduce(
          (acc, p) => [acc[0] + p.pos[0] / grounding.length, acc[1] + p.pos[1] / grounding.length, acc[2] + p.pos[2] / grounding.length],
          [0, 0, 0]
        )
      : ideaAnchor
    const pos = [
      ideaAnchor[0] * 0.4 + centroid[0] * 0.6 + gauss() * 90,
      ideaAnchor[1] * 0.4 + centroid[1] * 0.6 + gauss() * 70,
      ideaAnchor[2] * 0.4 + centroid[2] * 0.6 + gauss() * 90
    ]
    const score = scoreById.get(idea.id)
    const noveltyScore = score?.noveltyScore ?? (idea.riskLevel === 'high-risk' ? 78 : idea.riskLevel === 'ambitious' ? 60 : 38)
    const feasibilityScore = score?.feasibilityScore ?? 55
    const excitementScore = score?.excitementScore ?? 55
    return {
      ...idea,
      type: 'idea',
      source: 'idea',
      branch: 'idea',
      year: 2026,
      influence: noveltyScore >= 70 ? 3 : noveltyScore >= 45 ? 2 : 1,
      noveltyScore,
      noveltyBreakdown: { novelty: noveltyScore, feasibility: feasibilityScore, excitement: excitementScore },
      rationale: score?.rationale ?? null,
      pos
    }
  })

  const edges = [
    ...ideas.flatMap((idea) => (idea.groundedIn || []).map((from) => ({ from, to: idea.id, type: 'grounds' }))),
    ...(ideasRaw.ideaEdges || [])
  ]

  await writeFile(new URL('../src/data/papers.json', import.meta.url), JSON.stringify(papers, null, 2))
  await writeFile(new URL('../src/data/ideas.json', import.meta.url), JSON.stringify(ideas, null, 2))
  await writeFile(new URL('../src/data/edges.json', import.meta.url), JSON.stringify(edges, null, 2))
  console.log(`Wrote ${papers.length} papers, ${ideas.length} ideas, ${edges.length} edges`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
