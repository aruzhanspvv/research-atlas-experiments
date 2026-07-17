// Runtime placement for newly generated nodes — NOT the offline layout.mjs
// pipeline (that stays a build-time/optional tool per the contract). This
// picks a deterministic 3D position for a new node without re-running any
// global force-directed solve, by anchoring near its most-similar existing
// neighbor (or its topic anchor if no neighbor is available) plus a small
// hash-seeded jitter so simultaneously-added nodes don't stack exactly.
import { mulberry32 } from '../../src/utils/prng.js'
import { similarity } from './embeddings.mjs'

function hashString(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const JITTER_RADIUS = 70
const FALLBACK_RADIUS = 260
const FALLBACK_RING_RADIUS = 980 // matches topics.js's RING_RADIUS so un-anchored topics still land in the same general shell as anchored ones, never at/near origin

// Deterministic ring position for a topic tag that didn't make topics.js's
// top-N anchor cut — same ring radius, angle derived from the topic's own
// hash so it's stable across runs (not random per node).
function fallbackAnchorForTopic(topic) {
  const rand = mulberry32(hashString(`fallback-anchor:${topic}`))
  const angle = rand() * Math.PI * 2
  const y = (rand() - 0.5) * 90
  return [Math.cos(angle) * FALLBACK_RING_RADIUS, y, Math.sin(angle) * FALLBACK_RING_RADIUS]
}

// existingNodes: nodes already positioned (have .pos.galaxy)
// topicMeta: Map from topics.js computeTopics(), used as a fallback anchor
export function placeNode(newNode, existingNodes, topicMeta) {
  const rand = mulberry32(hashString(newNode.id))

  // Prefer anchoring near the most similar existing node (keeps clusters
  // visually coherent — an idea appears near the papers it's grounded in).
  let best = null
  let bestScore = -1
  existingNodes.forEach((candidate) => {
    if (!candidate.pos?.galaxy) return
    const { score } = similarity(newNode, candidate)
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  })

  // Bug A fix: previously fell back to [0, 0, 0] (world origin) whenever a
  // node's primary topic wasn't among the top-N anchored topics in
  // topicMeta (e.g. a generated idea tagged "cs.LG"/"stat.ML" when those
  // tags didn't make the current dataset's top-10 anchor cut). Every such
  // node then rendered at/near the camera's default overview look-at
  // point — reported by the user as "random glowy dots in the center."
  // Fix: deterministically hash the topic string onto the same anchor ring
  // topics.js uses for its capped anchors (mirrors colorForTopic's
  // fallback-color logic), so an un-anchored topic still gets a stable,
  // spatially-sensible position instead of collapsing to the origin.
  let base
  if (best && bestScore > 0.05) {
    base = best.pos.galaxy
  } else {
    const primaryTopic = (newNode.topics ?? [])[0]
    const anchorMeta = primaryTopic ? topicMeta.get(primaryTopic) : null
    if (anchorMeta) {
      base = anchorMeta.anchor
    } else if (primaryTopic) {
      base = fallbackAnchorForTopic(primaryTopic)
    } else {
      base = [0, 0, 0]
    }
  }

  const jitterMag = best ? JITTER_RADIUS : FALLBACK_RADIUS
  const gauss = () => {
    const u = Math.max(rand(), 1e-9)
    const v = rand()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  const galaxy = [
    base[0] + gauss() * jitterMag,
    base[1] + gauss() * jitterMag * 0.4,
    base[2] + gauss() * jitterMag
  ]
  // timeline/scale lenses: place along the same axes conventions as
  // layout.mjs (year-based x, metric-based x) so lens switching still works
  // sensibly for newly-added nodes without needing the full offline solve.
  const year = newNode.year ?? new Date().getFullYear()
  const timeline = [(year - 2020) * 3.2 + gauss() * 20, gauss() * 25, gauss() * 40]
  const metric = newNode.type === 'idea' ? (newNode.noveltyScore ?? 0.5) * 300 : (newNode.influence ?? 1) * 60
  const scale = [metric, gauss() * 24, gauss() * 40]

  return { galaxy, timeline, scale }
}
