import { createStage } from './scene/renderer.js'
import { createBackgroundStars } from './scene/backgroundStars.js'
import { createDiscStars } from './scene/discStars.js'
import { createNebulae } from './scene/nebulae.js'
import { createTheoryStars } from './scene/stars.js'
import { createLineage } from './scene/edges.js'
import { createLabels } from './scene/labels.js'
import { createLensAxes } from './scene/lensAxis.js'
import { createCameraRig } from './scene/cameraRig.js'
import { BRANCHES } from './data/branches.js'
import { createHoverFocus } from './interact/hover.js'
import { createStarCard } from './ui/starCard.js'
import { createSearchBox } from './ui/searchBox.js'
import { createGeneratePanel } from './ui/generatePanel.js'
import { buildCorpusIndex, generateIdea } from './interact/ideaGenerator.js'
import { createDustLayer } from './scene/dustLayer.js'
import starsData from './data/stars.json'
import edgesData from './data/edges.json'
import dustData from './data/dust.json'
import { PRESETS, DEFAULT_PRESET } from './style/presets.js'
import { branchName, presetLabel, t } from './i18n.js'
import * as THREE from 'three'

document.title = t('app.documentTitle')

const app = document.getElementById('app')
const stage = createStage(app)

const backdrop = createBackgroundStars()
const disc = createDiscStars()
const nebulae = createNebulae()

let theoryStars = createTheoryStars(starsData.map((s) => ({ ...s, pos: s.pos.galaxy })))
let lineage = createLineage(starsData, edgesData)
const dustLayer = createDustLayer(dustData)
const lensAxis = createLensAxes()

const labelSource = [...starsData, ...dustData.map((d) => ({ ...d, influence: 0, dust: true }))]
const labels = createLabels(labelSource, document.body)

// —— Field legend: hover to preview a branch's cluster, click to pin ——
const branchLegend = document.getElementById('branchLegend')
const legendItems = new Map()
Object.entries(BRANCHES).forEach(([key, b]) => {
  const item = document.createElement('div')
  item.className = 'legend-item'
  item.dataset.key = key
  const dot = document.createElement('span')
  dot.className = 'legend-dot'
  dot.style.background = b.color
  dot.style.boxShadow = `0 0 8px ${b.color}`
  const name = document.createElement('span')
  name.className = 'legend-name'
  name.textContent = branchName(key, BRANCHES)
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
  theoryStars.object,
  lineage.object,
  dustLayer.object,
  labels.group,
  lensAxis.group
)
galaxy.rotation.set(0.06, 0, -0.09)
stage.scene.add(backdrop.object, galaxy)

const rig = createCameraRig(stage.camera, stage.renderer.domElement)

const hover = createHoverFocus({
  stars: starsData,
  edges: edgesData,
  camera: stage.camera,
  galaxy,
  canvas: stage.renderer.domElement,
  lineage,
  theoryStars,
  labels,
  nebulae
})

// —— Detail card ——
const starById = new Map(starsData.map((s) => [s.id, s]))
const card = createStarCard({ starById })

card.onClose((reason) => {
  hover.lock(null)
  if (reason !== 'dismiss') return
  resetAtlasView()
})
card.onNavigate((target) => {
  hover.lock(target.id)
  const pos = hover.getWorldPos(target.id)
  if (pos) rig.focusOn(pos, 340)
  card.open(target)
})

let downPos = null
stage.renderer.domElement.addEventListener('pointerdown', (e) => {
  downPos = { x: e.clientX, y: e.clientY }
})
stage.renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downPos) return
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y)
  downPos = null
  if (moved > 6) return
  const id = hover.hoverId
  if (id) {
    hover.lock(id)
    rig.focusOn(hover.getWorldPos(id), 340)
    card.open(starById.get(id))
  } else {
    card.close('dismiss')
    if (hover.pinnedBranch) {
      hover.pinBranch(null)
      setLegendActive(null)
    }
  }
})

// —— Lenses: galaxy / timeline / novelty ——
const LENSES = ['galaxy', 'timeline', 'novelty']
let lensCurrent = 'galaxy'
let lensAnim = null
let lensFade = 1
let searchBox = null

function flatTargets(list, lens) {
  const arr = new Float32Array(list.length * 3)
  list.forEach((s, i) => {
    arr[i * 3] = s.pos[lens][0]
    arr[i * 3 + 1] = s.pos[lens][1]
    arr[i * 3 + 2] = s.pos[lens][2]
  })
  return arr
}

function lensViewpoint(lens) {
  const inlierSpan = (i) => {
    const arr = starsData.map((s) => s.pos[lens][i]).sort((a, b) => a - b)
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
LENSES.forEach((key) => {
  const btn = document.createElement('button')
  btn.textContent = t(`lens.${key}`)
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
  theoryStars.beginLens(flatTargets(starsData, lens))
  dustLayer.beginLens(flatTargets(dustData, lens))
  lineage.beginLens(lens)
  labels.beginLens(lens)
  const view = lensViewpoint(lens)
  if (lens === 'galaxy') {
    rig.resetOverview()
    rig.steerTo(new THREE.Vector3(0.35, 0.52, 1).normalize())
  } else {
    rig.flyToView(view.center, view.radius)
    rig.steerTo(new THREE.Vector3(0.05, 1, 0.42).normalize())
  }
  setActiveLensButton(lens)
}

function finishLensAnimation() {
  if (!lensAnim) return
  theoryStars.setLensProgress(1)
  dustLayer.setLensProgress(1)
  lineage.setLensProgress(1)
  labels.setLensProgress(1)
  theoryStars.commitLens()
  dustLayer.commitLens()
  lineage.commitLens()
  labels.commitLens()
  lensCurrent = lensAnim.to
  lensAnim = null
  hover.refreshPositions(lensCurrent)
  hover.setEnabled(true)
}

function resetAtlasView() {
  card.close()
  searchBox?.clear()
  hover.lock(null)
  finishLensAnimation()
  if (lensCurrent !== 'galaxy') switchLens('galaxy')
  else {
    setActiveLensButton('galaxy')
    hover.refreshPositions('galaxy')
    hover.setEnabled(true)
  }
  rig.resetOverview()
}

// —— Search ——
searchBox = createSearchBox({
  stars: starsData,
  onSelect(star) {
    hover.lock(star.id)
    rig.focusOn(hover.getWorldPos(star.id), 340)
    card.open(star)
  }
})

// —— Generate Idea: client-side, evidence-grounded, no API key required.
// Ranks the fetched paper corpus by keyword overlap with the user's topic,
// synthesizes a templated idea from the top matches, and scores novelty by how
// far the idea bridges across branches. The new node is added live to the scene. ——
const paperCorpus = starsData.filter((s) => s.type === 'paper')
const corpusIndex = buildCorpusIndex(paperCorpus)

createGeneratePanel({
  onGenerate(query) {
    return generateIdea(query, corpusIndex, paperCorpus)
  },
  onAccept(idea) {
    injectLiveIdea(idea)
  }
})

function injectLiveIdea(idea) {
  // Ephemeral node: lives only in this session's scene graph, not persisted to disk.
  const anchor = BRANCHES[idea.branch].anchor
  const jitterPos = () => anchor.map((v, i) => v + (Math.random() - 0.5) * (i === 1 ? 40 : 160))
  idea.pos = { galaxy: jitterPos(), timeline: jitterPos(), novelty: jitterPos() }
  starById.set(idea.id, idea)

  const nextStarsData = [...starsData, idea]
  const nextEdgesData = [...edgesData, ...idea.groundedIn.map((pid) => ({ from: idea.id, to: pid, type: 'derivation' }))]

  const newTheoryStars = createTheoryStars(nextStarsData.map((s) => ({ ...s, pos: s.pos[lensCurrent] })))
  newTheoryStars.applyPreset(PRESETS[activePreset])
  galaxy.remove(theoryStars.object)
  galaxy.add(newTheoryStars.object)
  theoryStars = newTheoryStars

  const newLineage = createLineage(nextStarsData, nextEdgesData)
  galaxy.remove(lineage.object)
  galaxy.add(newLineage.object)
  lineage = newLineage

  hover.lock(idea.id)
  const worldPos = new THREE.Vector3(...idea.pos[lensCurrent]).applyMatrix4(galaxy.matrixWorld)
  rig.focusOn(worldPos, 300)
  card.open(idea)
}

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
  window.__atlas = { rig, camera: stage.camera, hover, card, switchLens, resetAtlasView }
}

// —— Visual style ——
const params = new URLSearchParams(location.search)
let activePreset = params.get('style') in PRESETS ? params.get('style') : DEFAULT_PRESET

const switcher = document.getElementById('styleSwitcher')
Object.entries(PRESETS).forEach(([key]) => {
  const btn = document.createElement('button')
  btn.textContent = presetLabel(key)
  btn.dataset.key = key
  btn.addEventListener('click', () => applyPreset(key))
  switcher.appendChild(btn)
})

document.getElementById('appTitle').textContent = t('app.title')
document.getElementById('appSubtitle').textContent = t('app.subtitle')
document.getElementById('branchLegend').setAttribute('aria-label', t('app.branchLegend'))
document.getElementById('styleSwitcher').setAttribute('aria-label', t('app.styleSwitcher'))
document.getElementById('lensSwitcher').setAttribute('aria-label', t('app.lensSwitcher'))
document.getElementById('hudHint').textContent = t('app.hint')
const resetBtn = document.getElementById('resetView')
resetBtn.setAttribute('aria-label', t('app.resetView'))
resetBtn.title = t('app.resetView')

function applyPreset(key) {
  activePreset = key
  const preset = PRESETS[key]
  stage.applyPreset(preset)
  backdrop.applyPreset(preset)
  nebulae.applyPreset(preset)
  theoryStars.applyPreset(preset)
  switcher.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.key === key)
  })
  const url = new URL(location.href)
  url.searchParams.set('style', key)
  history.replaceState(null, '', url)
}
applyPreset(activePreset)

// —— Debug frame rate (?debug) ——
const fpsEl = document.getElementById('fps')
const debug = params.has('debug')
if (debug) fpsEl.style.display = 'block'
let frames = 0
let fpsTimer = 0

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
    theoryStars.setLensProgress(lt)
    dustLayer.setLensProgress(lt)
    lineage.setLensProgress(lt)
    labels.setLensProgress(lt)
    if (lt >= 1) {
      theoryStars.commitLens()
      dustLayer.commitLens()
      lineage.commitLens()
      labels.commitLens()
      lensCurrent = lensAnim.to
      lensAnim = null
      hover.refreshPositions(lensCurrent)
      hover.setEnabled(true)
    }
  }
  const lensTargetKey = lensAnim ? lensAnim.to : lensCurrent
  lensFade += ((lensTargetKey === 'galaxy' ? 1 : 0.05) - lensFade) * Math.min(1, dt * 2.2)

  if (introClock < 7) {
    introClock += dt
    backdrop.setIntro(introStage(0.2, 2))
    theoryStars.setIntro(introStage(2.4, 2.4))
  }
  const introNeb = introStage(1.2, 2.6)
  const introDust = introStage(2.0, 2.6)

  const closeness = 1 - rig.getZoom01()
  const nebulaFade = (1 - closeness * 0.45) * focusDim * lensFade * introNeb
  const lineReveal = 1 - smoothstepJs(1500, 2600, radius)

  backdrop.update(t)
  disc.update(t, lensFade * introDust)
  nebulae.update(t, nebulaFade)
  theoryStars.update(t)
  lineage.update(t, lineReveal)
  dustLayer.update(t, focusDim * introDust)
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
      fpsEl.textContent = `${Math.round(frames / fpsTimer)} fps · ${activePreset}`
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
