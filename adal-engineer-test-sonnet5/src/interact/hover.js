import * as THREE from 'three'

// Hover/focus state machine: single source of truth for "what's related to
// what" in the map. Hovering any node lights up its direct connections
// (grounded-in + similar edges), keeps connected nodes bright, and dims the
// rest of the starfield. Screen-space nearest-neighbor picking with
// hysteresis (wider acquire radius, wider release radius) avoids flicker at
// node boundaries. Click locks focus (opens detail panel); click empty
// space clears it. Logic carried over from physics-atlas almost unchanged —
// only the domain vocabulary (star->node, branch->topic) changed.

const ACQUIRE_PX = 30
const RELEASE_PX = 46
const TOPIC_LABEL_CAP = 9

export function createHoverFocus({
  nodes,
  edges,
  camera,
  galaxy,
  canvas,
  edgeLayer,
  nodeStars,
  labels,
  nebulae
}) {
  const neighbors = new Map(nodes.map((n) => [n.id, new Set()]))
  const parents = new Map(nodes.map((n) => [n.id, new Set()])) // "to" side of grounded-in/similar
  const children = new Map(nodes.map((n) => [n.id, new Set()])) // "from" side
  edges.forEach((e) => {
    if (!neighbors.has(e.from) || !neighbors.has(e.to)) return
    neighbors.get(e.from).add(e.to)
    neighbors.get(e.to).add(e.from)
    children.get(e.from).add(e.to)
    parents.get(e.to).add(e.from)
  })
  const idToIndex = new Map(nodes.map((n, i) => [n.id, i]))

  // Topic clusters: precompute id/index sets per primary topic tag (hover
  // legend interaction — mirrors the old "branch" hover/pin behavior).
  const topicIds = new Map()
  const topicIdx = new Map()
  const topicLabelIds = new Map()
  nodes.forEach((n, i) => {
    const topic = (n.topics ?? [])[0]
    if (!topic) return
    if (!topicIds.has(topic)) {
      topicIds.set(topic, new Set())
      topicIdx.set(topic, new Set())
    }
    topicIds.get(topic).add(n.id)
    topicIdx.get(topic).add(i)
  })
  topicIds.forEach((ids, key) => {
    const selected = [...ids]
      .map((id) => nodes[idToIndex.get(id)])
      .sort((a, b) => (b.influence ?? b.noveltyScore * 5 ?? 0) - (a.influence ?? a.noveltyScore * 5 ?? 0))
      .slice(0, TOPIC_LABEL_CAP)
      .map((n) => n.id)
    topicLabelIds.set(key, new Set(selected))
  })

  // Full connection trail: all ancestors + all descendants (used when a
  // node's detail panel is locked open — shows the whole grounding chain).
  function computeLineage(id) {
    const set = new Set([id])
    const walk = (start, dir) => {
      const queue = [start]
      while (queue.length) {
        const cur = queue.pop()
        dir.get(cur)?.forEach((next) => {
          if (!set.has(next)) {
            set.add(next)
            queue.push(next)
          }
        })
      }
    }
    walk(id, parents)
    walk(id, children)
    return set
  }

  galaxy.updateMatrixWorld(true)
  let worldPos = []
  function refreshPositions(lensKey = 'galaxy') {
    worldPos = nodes.map((n) =>
      new THREE.Vector3(...n.pos[lensKey]).applyMatrix4(galaxy.matrixWorld)
    )
  }
  refreshPositions()

  let mouse = null
  let hoverId = null
  let pointedId = null // what's actually under the cursor this frame, regardless of lock state — see update()
  let lockedId = null
  let enabled = true
  const v = new THREE.Vector3()

  canvas.addEventListener('pointermove', (e) => {
    mouse = { x: e.clientX, y: e.clientY }
  })
  canvas.addEventListener('pointerleave', () => {
    mouse = null
  })

  function pick() {
    if (!mouse) return null
    const w = window.innerWidth
    const h = window.innerHeight
    let best = null
    let bestScore = Infinity
    for (let i = 0; i < nodes.length; i += 1) {
      if (i >= worldPos.length) continue // live-added node not yet positioned this frame
      v.copy(worldPos[i]).project(camera)
      if (v.z > 1) continue
      const sx = ((v.x + 1) / 2) * w
      const sy = ((1 - v.y) / 2) * h
      const d = Math.hypot(sx - mouse.x, sy - mouse.y)
      const weight = nodes[i].influence ?? (nodes[i].noveltyScore ?? 0.5) * 5
      const score = d - weight * 3
      if (score < bestScore) {
        bestScore = score
        best = { id: nodes[i].id, d }
      }
    }
    if (!best) return null
    // Compare against pointedId (last frame's actual cursor target), not
    // hoverId — hoverId can equal lockedId while a node is locked, which
    // would otherwise apply the release-radius hysteresis to the WRONG
    // node (the locked one) instead of whatever the cursor was truly near.
    const limit = best.id === pointedId ? RELEASE_PX : ACQUIRE_PX
    return best.d <= limit ? best.id : null
  }

  let topicHover = null
  let topicPin = null
  let focusSig = ''

  function applyNode(id) {
    const full = lockedId === id ? computeLineage(id) : null
    const keepIds = full ?? new Set([id, ...(neighbors.get(id) ?? [])])
    const keepIdx = new Set([...keepIds].map((k) => idToIndex.get(k)).filter((i) => i !== undefined))
    edgeLayer.setFocus(id, full)
    nodeStars.setFocus(keepIdx)
    labels.setFocus(keepIds)
    nebulae?.setBranchFocus(null)
    canvas.style.cursor = 'pointer'
  }

  function applyTopic(key) {
    const ids = topicIds.get(key)
    const idx = topicIdx.get(key)
    nodeStars.setFocus(idx)
    labels.setFocus(topicLabelIds.get(key), {
      forceFocusedLabels: false,
      unfocusedOpacityScale: 0.02
    })
    edgeLayer.setFocusIds(ids)
    nebulae?.setBranchFocus(key)
    canvas.style.cursor = ''
  }

  function clearFocus() {
    edgeLayer.setFocus(null)
    edgeLayer.setFocusIds(null)
    nodeStars.setFocus(null)
    labels.setFocus(null)
    nebulae?.setBranchFocus(null)
    canvas.style.cursor = ''
  }

  function applyEffective() {
    const nodeId = hoverId
    const topicKey = topicHover ?? topicPin
    const sig = nodeId
      ? `n:${nodeId}:${lockedId === nodeId ? 'L' : ''}`
      : topicKey
        ? `t:${topicKey}`
        : ''
    if (sig === focusSig) return
    focusSig = sig
    if (nodeId) applyNode(nodeId)
    else if (topicKey) applyTopic(topicKey)
    else clearFocus()
  }

  let dim = 1

  // Bug B fix: pick() previously never ran once a node was locked
  // (`lockedId ?? (enabled ? pick() : null)` short-circuited it before
  // pick() could execute), so hoverId stayed permanently pinned to the
  // locked node no matter where the cursor moved. main.js's click handler
  // reads hover.hoverId to decide which node a click targets — with pick()
  // disabled, clicking a visually different, nearby node while one was
  // already focused always resolved back to the SAME locked node, so the
  // only way to select a neighbor was to deselect first and click again
  // from the overview. Reported by the user as "can't click any other
  // node around it while centered on one."
  //
  // Fix: always run pick() to know what's actually under the cursor
  // (pointedId), independent of lock state. Visual focus/highlighting
  // still follows lockedId while locked (clicking doesn't change what's
  // highlighted until the click is processed), but callers that need to
  // know "what would a click hit right now" read pointedId via the
  // exposed getter below, not hoverId.
  function update(dt) {
    pointedId = enabled ? pick() : null
    hoverId = lockedId ?? pointedId
    applyEffective()
    const focused = Boolean(hoverId)
    dim += ((focused ? 0.4 : 1) - dim) * Math.min(1, dt * 7)
    return dim
  }

  function lock(id) {
    lockedId = id
    applyEffective()
  }

  function setBranchHover(key) {
    topicHover = key
  }
  function pinBranch(key) {
    topicPin = key
  }

  // —— Live insertion: register a newly generated node's graph edges so
  // hover/lineage logic sees it without a full state rebuild ——
  // NOTE: `nodes` here is the SAME array reference main.js holds — main.js
  // pushes the new node onto it BEFORE calling this, so we must NOT push
  // again here (that caused a real double-entry bug) and must index by
  // `nodes.length - 1` (the node's already-final position), not `.length`.
  function registerNode(node) {
    neighbors.set(node.id, new Set())
    parents.set(node.id, new Set())
    children.set(node.id, new Set())
    idToIndex.set(node.id, nodes.length - 1)
    worldPos.push(new THREE.Vector3(...node.pos.galaxy).applyMatrix4(galaxy.matrixWorld))
  }

  function registerEdge(edge) {
    if (!neighbors.has(edge.from) || !neighbors.has(edge.to)) return
    neighbors.get(edge.from).add(edge.to)
    neighbors.get(edge.to).add(edge.from)
    children.get(edge.from).add(edge.to)
    parents.get(edge.to).add(edge.from)
  }

  return {
    update,
    lock,
    refreshPositions,
    setBranchHover,
    pinBranch,
    registerNode,
    registerEdge,
    setEnabled(on) {
      enabled = on
    },
    get hoverId() { return hoverId },
    // Bug B fix: the id actually under the cursor this frame, independent
    // of lock state — use this (not hoverId) to decide what a click
    // should target, so clicking a different node while another is
    // locked/focused is detected correctly.
    get pointedId() { return pointedId },
    get pinnedBranch() { return topicPin },
    getWorldPos(id) {
      return worldPos[idToIndex.get(id)]
    }
  }
}
