import { createStage } from './scene/renderer.js'
import { createBackgroundStars } from './scene/backgroundStars.js'
import { createDiscStars } from './scene/discStars.js'
import { createNebulae } from './scene/nebulae.js'
import { createNodeStars } from './scene/nodeStars.js'
import { createEdges } from './scene/edges.js'
import { createLabels } from './scene/labels.js'
import { createLensAxes } from './scene/lensAxis.js'
import { createCameraRig } from './scene/cameraRig.js'
import { computeTopics } from './data/topics.js'
import { createHoverFocus } from './interact/hover.js'
import { createNodeCard } from './ui/nodeCard.js'
import { createHoverTooltip } from './ui/hoverTooltip.js'
import { createSearchBox } from './ui/searchBox.js'
import { createIdeaComposer } from './ui/ideaComposer.js'
import nodesData from './data/nodes.json'
import edgesData from './data/edges.json'
import { PRESETS, DEFAULT_PRESET } from './style/presets.js'
import * as liveSource from './data/liveSource.js'
import * as THREE from 'three'

const app = document.getElementById('app')
const stage = createStage(app)

// Live, mutable copies — the arrays that get appended to when new
// ideas/edges are generated (see wireGeneration() below). The imported
// nodesData/edgesData stay as the initial immutable snapshot.
const nodes = [...nodesData]
const edgeList = [...edgesData]
const nodeById = new Map(nodes.map((n) => [n.id, n]))

const { order: topicOrder, meta: topicMeta } = computeTopics(nodes, 10)

const backdrop = createBackgroundStars()
const disc = createDiscStars()
const nebulae = createNebulae(topicMeta)
const nodeStars = createNodeStars(nodes, topicMeta)
const edgeLayer = createEdges(nodes, edgeList, topicMeta)
const lensAxis = createLensAxes()

const labelSource = nodes
const labels = createLabels(labelSource, document.body)

// Topic legend: a row of color dots + names, generated from computeTopics()
// instead of the old hardcoded BRANCHES. Hover = temporary topic focus,
// click = pin (unpin on repeat click / empty-space click / lens switch).
const branchLegend = document.getElementById('branchLegend')
const legendItems = new Map()
topicOrder.forEach((key) => {
  const meta = topicMeta.get(key)
  const item = document.createElement('div')
  item.className = 'legend-item'
  item.dataset.key = key
  const dot = document.createElement('span')
  dot.className = 'legend-dot'
  dot.style.background = meta.color
  dot.style.boxShadow = `0 0 8px ${meta.color}`
  const name = document.createElement('span')
  name.className = 'legend-name'
  name.textContent = key
  item.append(dot, name)
  branchLegend.appendChild(item)
  legendItems.set(key, item)
})

function setLegendActive(key) {
  legendItems.forEach((el, k) => el.classList.toggle('active', k === key))
}
branchLegend.addEventListener('pointerover', (e) => {
  const item = e.target.closest('.legend-item')
  if (item) hover.setBranchHover(item.dataset.key)
})
branchLegend.addEventListener('pointerout', (e) => {
  const item = e.target.closest('.legend-item')
  if (item && !item.contains(e.relatedTarget)) hover.setBranchHover(null)
})
branchLegend.addEventListener('click', (e) => {
  const item = e.target.closest('.legend-item')
  if (!item) return
  const key = item.dataset.key
  const next = hover.pinnedBranch === key ? null : key
  hover.pinBranch(next)
  setLegendActive(next)
})

const galaxy = new THREE.Group()
galaxy.add(
  disc.object,
  nebulae.object,
  nodeStars.object,
  edgeLayer.object,
  labels.group,
  lensAxis.group
)
galaxy.rotation.set(0.06, 0, -0.09)
stage.scene.add(backdrop.object, galaxy)

const rig = createCameraRig(stage.camera, stage.renderer.domElement)

const hover = createHoverFocus({
  nodes,
  edges: edgeList,
  camera: stage.camera,
  galaxy,
  canvas: stage.renderer.domElement,
  edgeLayer,
  nodeStars,
  labels,
  nebulae
})

// —— Detail card + hover tooltip ——
const card = createNodeCard()
const tooltip = createHoverTooltip()
card.setNodeLookup((id) => nodeById.get(id))

function relatedFor(node) {
  const groundedByThis = edgeList.filter((e) => e.type === 'grounded-in' && e.to === node.id).map((e) => e.from)
  const similar = edgeList
    .filter((e) => e.type === 'similar' && (e.from === node.id || e.to === node.id))
    .map((e) => (e.from === node.id ? e.to : e.from))
  return { groundedByThis, similar }
}

card.onClose((reason) => {
  hover.lock(null)
  if (reason !== 'dismiss') return
  resetAtlasView()
})

let downPos = null
stage.renderer.domElement.addEventListener('pointerdown', (e) => {
  downPos = { x: e.clientX, y: e.clientY }
})
stage.renderer.domElement.addEventListener('pointermove', (e) => {
  // Hover tooltip: semi-transparent panel that follows the cursor.
  // Bug B fix: use pointedId (what the cursor is actually near right now),
  // not hoverId (which equals the LOCKED node while a card is open) — so
  // hovering a different, nearby node while one is already focused still
  // shows that neighbor's tooltip, giving a clear visual cue that clicking
  // it will re-focus there instead of appearing completely unresponsive.
  const id = hover.pointedId
  if (id) {
    const node = nodeById.get(id)
    if (node) tooltip.show(node, e.clientX, e.clientY)
  } else {
    tooltip.hide()
  }
})
stage.renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downPos) return
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y)
  downPos = null
  if (moved > 6) return
  // Bug B fix: read pointedId (live cursor target), not hoverId — hoverId
  // stays pinned to the currently-locked node while one is focused, which
  // previously made it impossible to click a different, visible neighbor
  // without first deselecting. pointedId always reflects what's actually
  // under the cursor, so clicking node B while node A is focused now
  // directly re-locks and re-opens the card for B.
  const id = hover.pointedId
  if (id) {
    hover.lock(id)
    tooltip.hide()
    composer.close() // mutual exclusivity with the idea composer (see Bug #2 fix)
    rig.focusOn(hover.getWorldPos(id), 340)
    const node = nodeById.get(id)
    card.open(node, relatedFor(node))
  } else {
    card.close('dismiss')
    hover.lock(null)
    if (hover.pinnedBranch) {
      hover.pinBranch(null)
      setLegendActive(null)
    }
  }
})

// —— Lenses: galaxy / timeline / scale ——
const LENSES = ['galaxy', 'timeline', 'scale']
let lensCurrent = 'galaxy'
let lensAnim = null
let lensFade = 1
let searchBox = null

function flatTargets(list, lens) {
  const arr = new Float32Array(list.length * 3)
  list.forEach((n, i) => {
    arr[i * 3] = n.pos[lens][0]
    arr[i * 3 + 1] = n.pos[lens][1]
    arr[i * 3 + 2] = n.pos[lens][2]
  })
  return arr
}

function lensViewpoint(lens) {
  const inlierSpan = (i) => {
    const arr = nodes.map((n) => n.pos[lens][i]).sort((a, b) => a - b)
    const q10 = arr[Math.floor(arr.length * 0.1)]
    const q90 = arr[Math.ceil(arr.length * 0.9) - 1]
    const spread = Math.max(q90 - q10, 1)
    const inliers = arr.filter((v) => v >= q10 - 2 * spread && v <= q90 + 2 * spread)
    const lo = inliers[0]
    const hi = inliers[inliers.length - 1]
    return { mid: (lo + hi) / 2, size: hi - lo }
  }
  const sx = inlierSpan(0)
  const sz = inlierSpan(2)
  const AXIS_REACH = 560
  const zLo = Math.min(sz.mid - sz.size / 2, -340)
  const zHi = Math.max(sz.mid + sz.size / 2, AXIS_REACH)
  const zMid = (zLo + zHi) / 2
  const zSpan = zHi - zLo
  const center = new THREE.Vector3(sx.mid, 0, zMid).applyEuler(galaxy.rotation)
  const tanV = Math.tan((stage.camera.fov * Math.PI) / 360)
  const tanH = tanV * stage.camera.aspect
  const rX = (sx.size * 0.5) / tanH
  const rZ = (zSpan * 0.5) / tanV
  return {
    center,
    radius: THREE.MathUtils.clamp(Math.max(rX, rZ, 1150) * 1.18, 1150, 3400)
  }
}

const lensSwitcher = document.getElementById('lensSwitcher')
const LENS_LABELS = { galaxy: 'GALAXY', timeline: 'TIMELINE', scale: 'INFLUENCE' }
LENSES.forEach((key) => {
  const btn = document.createElement('button')
  btn.textContent = LENS_LABELS[key]
  btn.dataset.key = key
  btn.classList.toggle('active', key === lensCurrent)
  btn.addEventListener('click', () => switchLens(key))
  lensSwitcher.appendChild(btn)
})

function setActiveLensButton(lens) {
  lensSwitcher.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.key === lens)
  })
}

function switchLens(lens) {
  if (lens === lensCurrent || lensAnim) return
  lensAnim = { to: lens, t: 0 }
  card.close()
  hover.lock(null)
  hover.setBranchHover(null)
  hover.pinBranch(null)
  setLegendActive(null)
  hover.setEnabled(false)
  nodeStars.beginLens(flatTargets(nodes, lens))
  edgeLayer.beginLens(lens)
  labels.beginLens(lens)
  const view = lensViewpoint(lens)
  if (lens === 'galaxy') {
    rig.resetOverview(view)
    rig.steerTo(new THREE.Vector3(0.35, 0.52, 1).normalize())
  } else {
    rig.flyToView(view.center, view.radius)
    rig.steerTo(new THREE.Vector3(0.05, 1, 0.42).normalize())
  }
  setActiveLensButton(lens)
}

function finishLensAnimation() {
  if (!lensAnim) return
  nodeStars.setLensProgress(1)
  edgeLayer.setLensProgress(1)
  labels.setLensProgress(1)
  nodeStars.commitLens()
  edgeLayer.commitLens()
  labels.commitLens()
  lensCurrent = lensAnim.to
  lensAnim = null
  hover.refreshPositions(lensCurrent)
  hover.setEnabled(true)
}

function resetAtlasView() {
  card.close()
  tooltip.hide()
  searchBox?.clear()
  hover.lock(null)
  finishLensAnimation()
  if (lensCurrent !== 'galaxy') switchLens('galaxy')
  else {
    setActiveLensButton('galaxy')
    hover.refreshPositions('galaxy')
    hover.setEnabled(true)
  }
  rig.resetOverview(lensViewpoint('galaxy'))
}

// —— Search ——
searchBox = createSearchBox({
  nodes,
  onSelect(node) {
    card.close()
    composer.close() // mutual exclusivity with the idea composer (see Bug #2 fix)
    hover.lock(node.id)
    rig.focusOn(hover.getWorldPos(node.id), 340)
    card.open(node, relatedFor(node))
  }
})

document.getElementById('resetView').addEventListener('click', resetAtlasView)
window.addEventListener('keydown', (e) => {
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
  if (typing) return
  if (e.key === '0' || e.key === 'Home') {
    e.preventDefault()
    resetAtlasView()
  }
})

if (import.meta.env.DEV) {
  window.__atlas = { rig, camera: stage.camera, hover, card, switchLens, resetAtlasView, nodes, edgeList, nodeStars, edgeLayer, stage, galaxy }
}

// —— Idea composer (UC2 topic / UC3 paper refs) ——
const composerToggle = document.getElementById('composerToggle')
const composer = createIdeaComposer({
  onStatusCheck: () => liveSource.getStatus(),
  async onGenerate(payload) {
    const result = await liveSource.generateIdeas(payload)
    if (result.ideas?.length) insertGeneratedNodes(result.ideas, result.edges ?? [])
    return result
  }
})
// Mutual exclusivity fix: the composer (top-right, top:88px) and the node
// detail card (right-aligned, vertically centered) can overlap on many
// viewport heights since the card's centered box spans a wide vertical
// range that intersects the composer's fixed region. Rather than trying to
// carve out non-overlapping real estate for two independently-sized right-
// docked panels, close whichever one is open before opening the other —
// only one is ever visible at a time, so they can never visually collide.
composerToggle.addEventListener('click', () => {
  if (card.isOpen) card.close('dismiss')
  composer.toggle()
})

// Live insertion: appends newly generated idea nodes + their edges into
// EVERY live subsystem (nodeStars/edges buffers via capacity headroom,
// hover.js graph maps, labels, search index, card lookup) without
// rebuilding any geometry — satisfies contract §6.
function insertGeneratedNodes(newNodes, newEdges) {
  newNodes.forEach((node) => {
    nodes.push(node)
    nodeById.set(node.id, node)
    hover.registerNode(node)
    edgeLayer.registerNode(node)
    nodeStars.addNode(node)
    labels.addLabel(node)
  })
  newEdges.forEach((edge) => {
    edgeList.push(edge)
    hover.registerEdge(edge)
    edgeLayer.addEdge(edge)
  })
}

// —— Style preset (deepfield is the only preset now; kept for future presets) ——
const activePreset = DEFAULT_PRESET
function applyPreset(key) {
  const preset = PRESETS[key]
  stage.applyPreset(preset)
  backdrop.applyPreset(preset)
  nebulae.applyPreset(preset)
  nodeStars.applyPreset(preset)
}
applyPreset(activePreset)

// Bug A fix: fit the camera's overview target/radius to the ACTUAL seeded
// dataset from the very first frame, rather than only fixing it lazily on
// the next "Reset view" or lens switch — a static hardcoded overview no
// longer reliably framed every topic cluster once topics.js's wider
// RING_RADIUS-based layout was in place (see cameraRig.js resetOverview()
// for full root-cause detail). This also has the side effect of correctly
// excluding any origin-defaulted stray nodes from dominating the initial
// framing.
rig.resetOverview(lensViewpoint('galaxy'))

document.getElementById('appTitle').textContent = 'Research Idea Atlas'
document.getElementById('appSubtitle').textContent = 'Papers × Generated Ideas'
document.getElementById('hudHint').textContent = 'DRAG TO ROTATE · SCROLL TO ZOOM'
document.getElementById('resetView').title = 'Reset view'
document.getElementById('resetView').setAttribute('aria-label', 'Reset view')

// —— Debug FPS (?debug) ——
const params = new URLSearchParams(location.search)
const fpsEl = document.getElementById('fps')
const debug = params.has('debug')
if (debug) fpsEl.style.display = 'block'
let frames = 0
let fpsTimer = 0

// Bug #2 root-cause fix: the render loop (and every damped visual state —
// hover.js's focusDim, main.js's lensFade/lensAnim progress) is entirely
// requestAnimationFrame-driven. Browsers throttle/pause rAF when a tab is
// backgrounded (document.hidden), so if a lens-switch or focus-dim
// transition was mid-flight the instant the tab lost visibility, that
// intermediate (dim) state can persist indefinitely once the tab regains
// focus — there is no "catch-up" tick to finish the transition. This is
// the actual mechanism behind the reported nebula/bloom degradation after
// normal interaction: repeated open/close + composer-toggle cycles simply
// increase the chance one of them straddles a backgrounding event.
// clock.getDelta() also accumulates unbounded real time while paused, so
// the very next tick after resuming visibility could otherwise report a
// huge dt — already guarded by Math.min(dt, 0.05) below, but that alone
// doesn't un-stick a transition that was frozen mid-value.
// Fix: on regaining visibility, reset the clock (avoid a delta spike) and
// snap any in-progress lens animation straight to its completed state, so
// the scene can never be left showing a stale, partially-dimmed frame.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return
  clock.getDelta() // drain accumulated idle time so the next real tick isn't a spike
  if (lensAnim) finishLensAnimation()
  // Bug #2 (round-3) fallback: the intro/nebula reveal is advanced only by
  // introClock inside the rAF loop, so a tab that LOADED already-backgrounded
  // never completes it and stays empty until focused. Force-complete the
  // intro here so the populated map appears immediately on first focus.
  if (introClock < 3) {
    introClock = 3
    backdrop.setIntro(1)
    nodeStars.setIntro(1)
  }
  // Force an immediate composer.render() so the recovered/settled state is
  // visible right away rather than waiting for the next natural rAF tick
  // (which itself may be delayed by however long the browser takes to
  // resume normal rAF cadence after a background period).
  stage.composer.render()
})

// —— Main loop ——
const clock = new THREE.Clock()
let simTime = 0
let introClock = 0
const prevCamPos = stage.camera.position.clone()

function introStage(from, dur) {
  const k = Math.min(Math.max((introClock - from) / dur, 0), 1)
  return k * k * (3 - 2 * k)
}

function smoothstepJs(a, b, x) {
  const k = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return k * k * (3 - 2 * k)
}

function tick(dt) {
  simTime += dt
  const t = simTime

  rig.update(dt, t)
  const radius = rig.radius

  const camMoving =
    stage.camera.position.distanceToSquared(prevCamPos) > radius * radius * 4e-6
  prevCamPos.copy(stage.camera.position)

  const focusDim = hover.update(dt)

  if (lensAnim) {
    lensAnim.t = Math.min(1, lensAnim.t + dt / 2.2)
    const lt = lensAnim.t
    nodeStars.setLensProgress(lt)
    edgeLayer.setLensProgress(lt)
    labels.setLensProgress(lt)
    if (lt >= 1) {
      nodeStars.commitLens()
      edgeLayer.commitLens()
      labels.commitLens()
      lensCurrent = lensAnim.to
      lensAnim = null
      hover.refreshPositions(lensCurrent)
      hover.setEnabled(true)
    }
  }
  const lensTargetKey = lensAnim ? lensAnim.to : lensCurrent
  lensFade += ((lensTargetKey === 'galaxy' ? 1 : 0.05) - lensFade) * Math.min(1, dt * 2.2)

  // Intro fade-in kept intentionally SHORT and populated-by-default: unlike
  // the deepfield reference (empty canvas until a tour interaction), this
  // app's ~27 seeded nodes are visible within the first couple seconds —
  // satisfying the "must not replicate the empty idle view" requirement.
  if (introClock < 3) {
    introClock += dt
    backdrop.setIntro(introStage(0.05, 1.1))
    nodeStars.setIntro(introStage(0.4, 1.3))
  }
  const introNeb = introStage(0.3, 1.4)

  const closeness = 1 - rig.getZoom01()
  const nebulaFade = (1 - closeness * 0.45) * focusDim * lensFade * introNeb
  const lineReveal = 1 - smoothstepJs(1500, 2600, radius)

  backdrop.update(t)
  disc.update(t, lensFade)
  nebulae.update(t, nebulaFade)
  nodeStars.update(t)
  edgeLayer.update(t, lineReveal)
  lensAxis.update(lensCurrent, lensAnim, dt)
  labels.update(radius, camMoving || Boolean(lensAnim))

  stage.composer.render()
  labels.render(stage.scene, stage.camera)
}

function frame() {
  requestAnimationFrame(frame)
  const dt = Math.min(clock.getDelta(), 0.05)
  tick(dt)

  if (debug) {
    frames += 1
    fpsTimer += dt
    if (fpsTimer >= 0.5) {
      fpsEl.textContent = `${Math.round(frames / fpsTimer)} fps · ${nodes.length} nodes`
      frames = 0
      fpsTimer = 0
    }
  }
}
frame()

if (import.meta.env.DEV) {
  window.__atlas.step = (n = 1, dt = 1 / 60) => {
    for (let i = 0; i < n; i += 1) tick(dt)
    return Math.round(rig.radius)
  }
}
