import { mulberry32 } from '../utils/prng.js'

// Generic, data-driven replacement for the old hardcoded `branches.js`.
// Instead of 6 fixed physics subjects, we derive a small set of topic
// "constellation anchors" from whatever tags actually appear in nodes.json.
// Deterministic: same topic string always hashes to the same color/anchor,
// so re-running the app with the same dataset produces a stable layout
// (matches the spirit of the original file, which was a hand-authored
// single source of truth shared by the renderer and tools/layout.mjs).

// Fixed hue palette (extends the original 6 branch colors with a few more
// so we can comfortably cover 6-12 topic clusters without visually
// clashing or repeating hues back-to-back).
const PALETTE = [
  '#ffd27a', // warm gold
  '#8a7dff', // violet
  '#ff7a4d', // ember orange
  '#4de6d9', // teal
  '#ff4dd2', // magenta
  '#3d5aff', // deep blue
  '#7bdc6a', // green
  '#ffe14d', // yellow
  '#ff6a8a', // rose
  '#5adfff', // sky
  '#c98aff', // lavender
  '#ffa64d' // amber
]

function hashString(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// Ring layout: topics are spread evenly around a large ring so nebula
// clouds don't overlap, with small deterministic jitter for an organic feel.
// Matches the diagonal-flow spirit of the original anchors (spread wide,
// not a rigid grid) while being computable for an arbitrary topic count.
const RING_RADIUS = 980
const RING_Y_JITTER = 90

export function extractTopicCounts(nodes) {
  const counts = new Map()
  nodes.forEach((n) => {
    (n.topics ?? []).forEach((tag) => {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    })
  })
  return counts
}

// Returns { order: string[], meta: Map<topicKey, {color, anchor:[x,y,z], nebula:{scale,elong,stretch}}> }
// `maxTopics` caps the number of dedicated nebula anchors (matches the old
// 6-branch scene density); topics beyond the cap still get a color (via
// palette cycling) but no dedicated nebula cloud, folded into the nearest
// anchor for layout purposes by tools/layout.mjs.
export function computeTopics(nodes, maxTopics = 10) {
  const counts = extractTopicCounts(nodes)
  const order = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxTopics)
    .map(([key]) => key)

  const meta = new Map()
  order.forEach((key, i) => {
    const rand = mulberry32(hashString(key))
    const angle = (i / Math.max(order.length, 1)) * Math.PI * 2
    const jitterAngle = (rand() - 0.5) * 0.35
    const jitterR = 0.85 + rand() * 0.3
    const a = angle + jitterAngle
    const anchor = [
      Math.cos(a) * RING_RADIUS * jitterR,
      (rand() - 0.5) * RING_Y_JITTER,
      Math.sin(a) * RING_RADIUS * jitterR
    ]
    meta.set(key, {
      key,
      color: PALETTE[i % PALETTE.length],
      anchor,
      nebula: {
        scale: 0.9 + rand() * 0.6,
        elong: [rand() * 2 - 1, rand() * 2 - 1],
        stretch: 1.2 + rand() * 0.7
      }
    })
  })
  return { order, meta }
}

// Color lookup for a node's primary topic (first tag), falling back to a
// neutral hash-based color if the tag didn't make the top-`maxTopics` cut
// (e.g. a long-tail tag on a node) so nothing ever renders colorless.
export function colorForTopic(topicMeta, tag) {
  if (!tag) return '#8fa0c8'
  const hit = topicMeta.get(tag)
  if (hit) return hit.color
  const rand = mulberry32(hashString(tag))
  return PALETTE[Math.floor(rand() * PALETTE.length)]
}
