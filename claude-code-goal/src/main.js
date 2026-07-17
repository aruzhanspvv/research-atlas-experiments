import * as THREE from 'three'
import { createStage } from './scene/renderer.js'
import { createBackgroundStars } from './scene/backgroundStars.js'
import { createNebulae } from './scene/nebulae.js'
import { createNodes } from './scene/nodes.js'
import { createLineage } from './scene/edges.js'
import { createLabels } from './scene/labels.js'
import { createCameraRig } from './scene/cameraRig.js'
import { BRANCHES } from './data/sources.js'
import { createHoverFocus } from './interact/hover.js'
import { createNodeCard } from './ui/nodeCard.js'
import { createNodeSearch } from './ui/nodeSearch.js'
import { createGeneratePanel } from './ui/generatePanel.js'
import papersData from './data/papers.json'
import ideasData from './data/ideas.json'
import edgesData from './data/edges.json'
import { PRESETS, DEFAULT_PRESET } from './style/presets.js'

const nodesData = [...papersData, ...ideasData]
const byId = new Map(nodesData.map((n) => [n.id, n]))

const app = document.getElementById('app')
const stage = createStage(app)

const backdrop = createBackgroundStars()
const nebulae = createNebulae()
const nodes = createNodes(nodesData)
const lineage = createLineage(nodesData, edgesData)

const labelSource = nodesData.map((n) => ({ ...n, pos: { galaxy: n.pos } }))
const labels = createLabels(labelSource, document.body)

// Source legend: hover to preview a branch, click to pin it.
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
  name.textContent = b.label
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
galaxy.add(nebulae.object, nodes.object, lineage.object, labels.group)
galaxy.rotation.set(0.06, 0, -0.09)
stage.scene.add(backdrop.object, galaxy)

const rig = createCameraRig(stage.camera, stage.renderer.domElement)

const hover = createHoverFocus({
  stars: nodesData,
  edges: edgesData,
  camera: stage.camera,
  galaxy,
  canvas: stage.renderer.domElement,
  lineage,
  theoryStars: nodes,
  labels,
  nebulae
})

const card = createNodeCard({
  byId,
  onJump(node) {
    hover.lock(node.id)
    rig.focusOn(hover.getWorldPos(node.id), 340)
    card.open(node)
  }
})

card.onClose((reason) => {
  hover.lock(null)
  if (reason !== 'dismiss') return
  resetAtlasView()
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
    card.open(byId.get(id))
  } else {
    card.close('dismiss')
    if (hover.pinnedBranch) {
      hover.pinBranch(null)
      setLegendActive(null)
    }
  }
})

function resetAtlasView() {
  card.close()
  searchBox?.clear()
  hover.lock(null)
  setLegendActive(null)
  hover.refreshPositions()
  hover.setEnabled(true)
  rig.resetOverview()
}

const searchBox = createNodeSearch({
  nodes: nodesData,
  onSelect(node) {
    hover.lock(node.id)
    rig.focusOn(hover.getWorldPos(node.id), 340)
    card.open(node)
  },
  onGenerate(topic) {
    generatePanel.openWithTopic(topic)
  }
})

const generatePanel = createGeneratePanel()

document.getElementById('resetView').addEventListener('click', resetAtlasView)
window.addEventListener('keydown', (e) => {
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
  if (typing) return
  if (e.key === '0' || e.key === 'Home') {
    e.preventDefault()
    resetAtlasView()
  }
  if (e.key === 'g' || e.key === 'G') {
    generatePanel.open()
  }
})

if (import.meta.env.DEV) {
  window.__atlas = { rig, camera: stage.camera, hover, card, resetAtlasView }
}

// —— style presets ——
const params = new URLSearchParams(location.search)
let activePreset = params.get('style') in PRESETS ? params.get('style') : DEFAULT_PRESET

const switcher = document.getElementById('styleSwitcher')
Object.entries(PRESETS).forEach(([key, preset]) => {
  const btn = document.createElement('button')
  btn.textContent = preset.label
  btn.dataset.key = key
  btn.addEventListener('click', () => applyPreset(key))
  switcher.appendChild(btn)
})

function applyPreset(key) {
  activePreset = key
  const preset = PRESETS[key]
  stage.applyPreset(preset)
  backdrop.applyPreset(preset)
  nebulae.applyPreset(preset)
  nodes.applyPreset(preset)
  switcher.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.key === key))
  const url = new URL(location.href)
  url.searchParams.set('style', key)
  history.replaceState(null, '', url)
}
applyPreset(activePreset)

// —— debug fps (?debug) ——
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

function tick(dt) {
  simTime += dt
  const t = simTime

  rig.update(dt, t)
  const radius = rig.radius

  const camMoving = stage.camera.position.distanceToSquared(prevCamPos) > radius * radius * 4e-6
  prevCamPos.copy(stage.camera.position)

  const focusDim = hover.update(dt)

  if (introClock < 7) {
    introClock += dt
    backdrop.setIntro(introStage(0.2, 2))
    nodes.setIntro(introStage(2.4, 2.4))
  }
  const introNeb = introStage(1.2, 2.6)

  const closeness = 1 - rig.getZoom01()
  const nebulaFade = (1 - closeness * 0.45) * focusDim * introNeb
  const lineReveal = 1 - Math.min(Math.max((radius - 1500) / (2600 - 1500), 0), 1)

  backdrop.update(t)
  nebulae.update(t, nebulaFade)
  nodes.update(t)
  lineage.update(t, lineReveal)
  labels.update(radius, camMoving)

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
