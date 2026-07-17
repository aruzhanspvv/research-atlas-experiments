import * as THREE from 'three'

// Hover focus: works across BOTH the paper-star Points layer and the idea-star
// Points layer. Paper neighbours and idea cross-grounding edges all light up
// on hover; the picker walks both layers per frame.
//
// Edge highlighting goes through the existing edges.js shader path (`aHi`).
// Idea-stars draw their own rings; the dedicated idea shader does not need a
// focus dim because ideas are the rare, attention-deserving population.

const ACQUIRE_PX = 30
const RELEASE_PX = 46
const BRANCH_LABEL_CAP = 9

export function createHoverFocus({
  stars,
  edges,
  camera,
  galaxy,
  canvas,
  lineage,
  theoryStars,
  ideaStars,
  labels
}) {
  // Treat paper + idea as one logical graph for picking/highlighting.
  const allStars = stars
  const idToIndex = new Map(allStars.map((s, i) => [s.id, i]))
  const neighbors = new Map(allStars.map((s) => [s.id, new Set()]))
  const parents = new Map(allStars.map((s) => [s.id, new Set()]))
  const children = new Map(allStars.map((s) => [s.id, new Set()]))
  edges.forEach((e) => {
    if (!idToIndex.has(e.from) || !idToIndex.has(e.to)) return
    neighbors.get(e.from).add(e.to)
    neighbors.get(e.to).add(e.from)
    children.get(e.from).add(e.to)
    parents.get(e.to).add(e.from)
  })

  // Two index ranges — theoryStars is the first 0..theoryCount, ideaStars follows.
  const theoryCount = theoryStars?.count ?? stars.filter((s) => s.kind !== 'idea').length
  const paperIndices = new Set()
  const ideaIndices = new Set()
  allStars.forEach((s, i) => {
    if (s.kind === 'idea') ideaIndices.add(i)
    else paperIndices.add(i)
  })

  // Branch focus maps — papers only (ideas don't belong to a branch anchor grid).
  const branchIds = new Map()
  const branchIdx = new Map()
  const branchLabelIds = new Map()
  stars.forEach((s, i) => {
    if (s.kind === 'idea') return
    if (!branchIds.has(s.branch)) {
      branchIds.set(s.branch, new Set())
      branchIdx.set(s.branch, new Set())
    }
    branchIds.get(s.branch).add(s.id)
    branchIdx.get(s.branch).add(i)
  })
  branchIds.forEach((ids, key) => {
    const selected = [...ids]
      .map((id) => stars[idToIndex.get(id)])
      .sort((a, b) => b.influence - a.influence || a.year - b.year)
      .slice(0, BRANCH_LABEL_CAP)
      .map((s) => s.id)
    branchLabelIds.set(key, new Set(selected))
  })

  // Lineage walk (ancestors + descendants).
  function computeLineage(id) {
    const set = new Set([id])
    const walk = (start, dir) => {
      const queue = [start]
      while (queue.length) {
        const cur = queue.pop()
        dir.get(cur).forEach((next) => {
          if (!set.has(next)) { set.add(next); queue.push(next) }
        })
      }
    }
    walk(id, parents)
    walk(id, children)
    return set
  }

  // World positions for picking (always from current galaxy layout).
  galaxy.updateMatrixWorld(true)
  let worldPos = []
  function refreshPositions(_lensKey = 'galaxy') {
    worldPos = allStars.map((s) =>
      new THREE.Vector3(...s.pos.galaxy).applyMatrix4(galaxy.matrixWorld)
    )
  }
  refreshPositions()

  let mouse = null
  let hoverId = null
  let lockedId = null
  let enabled = true
  const v = new THREE.Vector3()

  canvas.addEventListener('pointermove', (e) => { mouse = { x: e.clientX, y: e.clientY } })
  canvas.addEventListener('pointerleave', () => { mouse = null })

  // Picking: walk all stars (papers + ideas). Idea influence is lower (2), so
  // they get a slight "pull" bonus so they aren't out-competed by big papers.
  function pick() {
    if (!mouse) return null
    const w = window.innerWidth
    const h = window.innerHeight
    let best = null
    let bestScore = Infinity
    for (let i = 0; i < allStars.length; i += 1) {
      v.copy(worldPos[i]).project(camera)
      if (v.z > 1) continue
      const sx = ((v.x + 1) / 2) * w
      const sy = ((1 - v.y) / 2) * h
      const d = Math.hypot(sx - mouse.x, sy - mouse.y)
      const ideaBonus = ideaIndices.has(i) ? 6 : 0
      const score = d - allStars[i].influence * 3 - ideaBonus
      if (score < bestScore) { bestScore = score; best = { id: allStars[i].id, d } }
    }
    if (!best) return null
    const limit = best.id === hoverId ? RELEASE_PX : ACQUIRE_PX
    return best.d <= limit ? best.id : null
  }

  let branchHover = null
  let branchPin = null
  let focusSig = ''

  function applyStar(id) {
    const full = lockedId === id ? computeLineage(id) : null
    const keepIds = full ?? new Set([id, ...neighbors.get(id)])
    const keepIdx = new Set([...keepIds].map((k) => idToIndex.get(k)))
    // Only papers get dim/non-dim focus — ideas stay readable always.
    lineage.setFocus(id, full)
    theoryStars.setFocus(keepIdx)
    labels.setFocus(keepIds, {
      forceFocusedLabels: full ? true : true,
      unfocusedOpacityScale: 0.02
    })
    canvas.style.cursor = 'pointer'
  }

  function applyBranch(key) {
    const ids = branchIds.get(key)
    const idx = branchIdx.get(key)
    theoryStars.setFocus(idx)
    labels.setFocus(branchLabelIds.get(key), {
      forceFocusedLabels: false,
      unfocusedOpacityScale: 0.02
    })
    lineage.setFocusIds(ids)
    canvas.style.cursor = ''
  }

  function clearFocus() {
    lineage.setFocus(null)
    lineage.setFocusIds(null)
    theoryStars.setFocus(null)
    labels.setFocus(null)
    canvas.style.cursor = ''
  }

  function applyEffective() {
    const starId = hoverId
    const branchKey = branchHover ?? branchPin
    const sig = starId
      ? `s:${starId}:${lockedId === starId ? 'L' : ''}`
      : branchKey ? `b:${branchKey}` : ''
    if (sig === focusSig) return
    focusSig = sig
    if (starId) applyStar(starId)
    else if (branchKey) applyBranch(branchKey)
    else clearFocus()
  }

  let dim = 1

  function update(dt) {
    const next = lockedId ?? (enabled ? pick() : null)
    hoverId = next
    applyEffective()
    const focused = Boolean(hoverId)
    dim += ((focused ? 0.4 : 1) - dim) * Math.min(1, dt * 7)
    return dim
  }

  function lock(id) { lockedId = id; applyEffective() }

  function setBranchHover(key) { branchHover = key }
  function pinBranch(key) { branchPin = key }

  return {
    update,
    lock,
    refreshPositions,
    setBranchHover,
    pinBranch,
    setEnabled(on) { enabled = on },
    get hoverId() { return hoverId },
    get pinnedBranch() { return branchPin },
    getWorldPos(id) { return worldPos[idToIndex.get(id)] },
    getStar(id) { return allStars[idToIndex.get(id)] }
  }
}
