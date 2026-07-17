// Research Idea Atlas — entry point.
//
// Composes the deepfield scene with:
//   · 25 arXiv seed papers (stars.json / seed-papers.json) as the paper-star layer.
//   · An idea-star layer (orbital-ring shader) populated on demand by the Ideate panel.
//   · Three ideation entry points routed through src/lib/ideate.js (one LLM module).
//   · A pre-allocated GPU buffer (MAX_STARS=4096, MAX_EDGES=8192) so live insertion
//     never triggers a scene rebuild.
//
// The original physics-history content (sims, tours, dust, demoStage) is gone.

import { createStage } from './scene/renderer.js'
import { createBackgroundStars } from './scene/backgroundStars.js'
import { createDiscStars } from './scene/discStars.js'
import { createNebulae } from './scene/nebulae.js'
import { createTheoryStars } from './scene/stars.js'
import { createIdeaStars } from './scene/ideaStars.js'
import { createLineage } from './scene/edges.js'
import { createLabels } from './scene/labels.js'
import { createLensAxes } from './scene/lensAxis.js'
import { createCameraRig } from './scene/cameraRig.js'
import { BRANCHES } from './data/branches.js'
import { createHoverFocus } from './interact/hover.js'
import { createStarCard } from './ui/starCard.js'
import { createIdeaCard } from './ui/ideaCard.js'
import { createIdeatePanel } from './ui/ideatePanel.js'
import { createApiKeyBanner } from './ui/apiKeyBanner.js'
import { createSearchBox } from './ui/searchBox.js'
import starsData from './data/stars.json'
import edgesData from './data/edges.json'
import { PRESETS, DEFAULT_PRESET } from './style/presets.js'
import {
  applyInitialLanguage,
  branchName,
  onLanguageChange,
  presetLabel,
  setLanguage,
  t
} from './i18n.js'
import { ideate } from './lib/ideate.js'
import { mulberry32 } from './utils/prng.js'
import * as THREE from 'three'
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'

applyInitialLanguage()

// EC-15: detect prefers-reduced-motion once at boot. Live changes are picked up
// inside cameraRig.js (auto-rotate gate). The intro animation itself is gated
// in `introStage()` below.
const reducedMotion = (typeof window !== 'undefined' && window.matchMedia)
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false

const app = document.getElementById('app')
const stage = createStage(app)

const backdrop = createBackgroundStars()
const disc = createDiscStars()
const nebulae = createNebulae()

// ── Paper-star layer ──────────────────────────────────────────────────────
const theoryStars = createTheoryStars(starsData)
const ideaStars = createIdeaStars([])

const starsById = new Map(starsData.map((s) => [s.id, s]))
const ideasLive = []            // idea-star records currently in the scene
const edgesLive = [...edgesData]

const lineage = createLineage(starsData, edgesData)
const lensAxis = createLensAxes()

// Labels cover both papers and any ideas that get added later (we extend the
// `labelSource` array on every new idea).
const labelSource = [...starsData]
const labels = createLabels(labelSource, document.body)

// Branch legend — drop the original "tours" block. Hover + click focus a branch.
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
  name.textContent = branchName(key)
  item.append(dot, name)
  branchLegend.appendChild(item)
  legendItems.set(key, item)
})

function setLegendActive(key) {
  legendItems.forEach((el, k) => el.classList.toggle('active', k === key))
}

// Galaxy: a single Group containing all scene-level transforms so the new
// ideaStars layer renders alongside the papers.
const galaxy = new THREE.Group()
galaxy.add(
  disc.object,
  nebulae.object,
  theoryStars.object,
  ideaStars.object,
  lineage.object,
  labels.group,
  lensAxis.group
)
galaxy.rotation.set(0.06, 0, -0.09)
stage.scene.add(backdrop.object, galaxy)

const rig = createCameraRig(stage.camera, stage.renderer.domElement)

const hover = createHoverFocus({
  stars: starsData,
  edges: edgesLive,
  camera: stage.camera,
  galaxy,
  canvas: stage.renderer.domElement,
  lineage,
  theoryStars,
  ideaStars,
  labels
})

// ── UI: paper card, idea card, ideation panel, search, API-key banner ─────
const card = createStarCard()
const ideaCard = createIdeaCard()
const starById = new Map(starsData.map((s) => [s.id, s]))
let searchBox = null

card.onClose((reason) => {
  hover.lock(null)
  if (reason !== 'dismiss') return
  resetAtlasView()
})
ideaCard.onClose(() => {
  hover.lock(null)
})
searchBox = createSearchBox({
  stars: starsData,
  onSelect(star) {
    ideaCard.close()
    hover.lock(star.id)
    rig.focusOn(hover.getWorldPos(star.id), 340)
    if (star.kind === 'idea') ideaCard.open(star)
    else card.open(star)
  }
})  // assigns to the let-bound searchBox above

// ── Wire the legend hover/click → branch focus ────────────────────────────
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

// ── Click → fly to + open card ────────────────────────────────────────────
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
  if (!id) {
    ideaCard.close('dismiss')
    card.close('dismiss')
    if (hover.pinnedBranch) {
      hover.pinBranch(null)
      setLegendActive(null)
    }
    return
  }
  const star = hover.getStar(id)
  hover.lock(id)
  rig.focusOn(hover.getWorldPos(id), 340)
  if (star?.kind === 'idea') {
    card.close('program')
    ideaCard.open(star)
  } else {
    ideaCard.close('program')
    card.open(star)
  }
})

// ── Lens switching (unchanged shape; we also animate the idea layer) ──────
const LENSES = ['galaxy', 'timeline', 'scale']
let lensCurrent = 'galaxy'
let lensAnim = null
let lensFade = 1
// searchBox is declared earlier (line ~120) so createSearchBox() can assign to it.

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
  lensSwitcher.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.key === lens))
}

function switchLens(lens) {
  if (lens === lensCurrent || lensAnim) return
  lensAnim = { to: lens, t: 0 }
  card.close()
  ideaCard.close()
  hover.lock(null)
  hover.setBranchHover(null)
  hover.pinBranch(null)
  setLegendActive(null)
  hover.setEnabled(false)
  theoryStars.beginLens(flatTargets(starsData, lens))
  ideaStars.beginLens(flatTargets(ideasLive, lens))
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

function resetAtlasView() {
  card.close()
  ideaCard.close()
  searchBox?.clear()
  hover.lock(null)
  if (lensCurrent !== 'galaxy') switchLens('galaxy')
  else {
    setActiveLensButton('galaxy')
    hover.refreshPositions('galaxy')
    hover.setEnabled(true)
  }
  rig.resetOverview()
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

// ── Preset switcher + language ────────────────────────────────────────────
const params = new URLSearchParams(location.search)
let activePreset = params.get('style') in PRESETS ? params.get('style') : DEFAULT_PRESET
const switcher = document.getElementById('styleSwitcher')
Object.entries(PRESETS).forEach(([key, preset]) => {
  const btn = document.createElement('button')
  btn.textContent = presetLabel(key)
  btn.dataset.key = key
  btn.addEventListener('click', () => applyPreset(key))
  switcher.appendChild(btn)
})
const languageSwitcher = document.getElementById('languageSwitcher')
languageSwitcher.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => setLanguage(b.dataset.key)))

function renderLanguageChrome() {
  document.getElementById('appTitle').textContent = t('app.title')
  document.getElementById('appSubtitle').textContent = t('app.subtitle')
  document.getElementById('branchLegend').setAttribute('aria-label', t('app.branchLegend'))
  document.getElementById('styleSwitcher').setAttribute('aria-label', t('app.styleSwitcher'))
  document.getElementById('lensSwitcher').setAttribute('aria-label', t('app.lensSwitcher'))
  document.getElementById('languageSwitcher').setAttribute('aria-label', t('app.languageSwitcher'))
  document.getElementById('hudHint').textContent = t('app.hint')
  const reset = document.getElementById('resetView')
  reset.setAttribute('aria-label', t('app.resetView'))
  reset.title = t('app.resetView')
  legendItems.forEach((el, key) => { el.querySelector('.legend-name').textContent = branchName(key) })
  lensSwitcher.querySelectorAll('button').forEach((btn) => { btn.textContent = t(`lens.${btn.dataset.key}`) })
  switcher.querySelectorAll('button').forEach((btn) => { btn.textContent = presetLabel(btn.dataset.key) })
  ideatePanel?.refreshKeyWarning()
}

function applyPreset(key) {
  activePreset = key
  const preset = PRESETS[key]
  stage.applyPreset(preset)
  backdrop.applyPreset(preset)
  nebulae.applyPreset(preset)
  theoryStars.applyPreset(preset)
  switcher.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.key === key))
  const url = new URL(location.href)
  url.searchParams.set('style', key)
  history.replaceState(null, '', url)
}
applyPreset(activePreset)
// ── API key banner (must appear before ideatePanel) ─────────
const apiBanner = createApiKeyBanner()

// ── Ideate panel (three entry points) ───────────────────────────
const ideatePanel = createIdeatePanel({
  onSubmit: async (payload) => {
    const paperRefs = payload.mode === "latest-papers"
      ? [...starsById.values()].slice(0, 5)
      : (payload.papers ?? [])
    return runIdeation(payload, paperRefs)
  },
  onSelect: () => {},
  starsById
})

async function runIdeation(payload, paperRefs) {
  const result = await ideate({
    topic: payload.topic ?? '',
    papers: paperRefs,
    mode: payload.mode,
    starsById
  })

  const ideaStar = result.ideaStar
  ideaStar.transport = result.transport
  ideaStar.noveltyBreakdown = result.noveltyBreakdown
  const statusEl = () => ideatePanel.root.querySelector('.ideate-status')

  if (ideasLive.some((s) => s.id === ideaStar.id)) {
    // True duplicate (same payload twice) — dedupe as before.
    statusEl().textContent = t('idea.dedupeNote')
    return
  }

  // EC-2/EC-4: surface inline status when 0 of N pasted refs resolved.
  // We tag the produced idea `speculative:true` so it can never silently dedupe
  // a real idea, and we tell the user explicitly what happened.
  if (result.speculative) {
    const resolved = (result.requestedRefs ?? 0) - (result.unresolvedRefs?.length ?? 0)
    const msg = `0 of ${result.requestedRefs} refs resolved (network/arXiv). Produced a speculative idea.`
    statusEl().textContent = msg
    // Log once (not a console.error) so headless harnesses can grep for it.
    if (typeof console !== 'undefined') console.info('[ideate]', msg, { unresolved: result.unresolvedRefs })
    void resolved
  }

  ideaStar.pos = placeIdea(ideaStar, starsById)

  starsData.push(ideaStar)
  starsById.set(ideaStar.id, ideaStar)
  ideasLive.push(ideaStar)
  theoryStars.addStar(ideaStar)
  ideaStars.addIdea(ideaStar)
  labelSource.push(ideaStar)

  spliceLabelForIdea(ideaStar)
  // Register with lineage so its edges can resolve by id
  lineage.registerStar(ideaStar)

  for (const edge of result.groundingEdges) {
    const idx = lineage.addEdge(edge)
    if (idx >= 0) edgesLive.push(edge)
  }

  hover.refreshPositions('galaxy')
  warnCapacity('star', theoryStars.count, theoryStars.capacity)
  warnCapacity('edge', lineage.count, lineage.capacity)

  // Fly to the new idea's world position directly (the idea is already in
  // starsData + hover.refreshPositions above; this sidesteps the getWorldPos
  // indirection and lets us pass plain numbers to focusOn).
  // focusOn expects a single worldPos object/Vector3, plus optional r, sideShift
  const wp = ideaStar.pos.galaxy
  rig.focusOn({ x: wp[0], y: wp[1], z: wp[2] }, 320)
  ideaCard.open(ideaStar)

  return ideaStar
}

function placeIdea(idea, paperMap) {
  const grounding = (idea.generatedFrom ?? [])
    .map((id) => paperMap.get(id))
    .filter(Boolean)
  let cx = 0, cy = 0, cz = 0
  if (grounding.length > 0) {
    grounding.forEach((p) => {
      cx += p.pos.galaxy[0]
      cy += p.pos.galaxy[1]
      cz += p.pos.galaxy[2]
    })
    cx /= grounding.length
    cy /= grounding.length
    cz /= grounding.length
  }
  const rng = mulberry32(hashString(idea.id))
  const radius = 220
  const theta = rng() * Math.PI * 2
  const phi = Math.acos(2 * rng() - 1)
  let ox = cx + radius * Math.sin(phi) * Math.cos(theta)
  let oy = cy + radius * Math.sin(phi) * Math.sin(theta) * 0.3
  let oz = cz + radius * Math.cos(phi)
  for (let it = 0; it < 12; it += 1) {
    for (const other of starsData) {
      if (other.id === idea.id) continue
      const op = other.pos?.galaxy
      if (!op) continue
      const dx = ox - op[0]
      const dy = oy - op[1]
      const dz = oz - op[2]
      const d = Math.hypot(dx, dy, dz)
      if (d < 90 && d > 0.001) {
        const push = (90 - d) * 0.018
        ox += (dx / d) * push
        oy += (dy / d) * push
        oz += (dz / d) * push
      }
    }
  }
  return {
    galaxy: [Number(ox.toFixed(3)), Number(oy.toFixed(3)), Number(oz.toFixed(3))],
    timeline: ideaTimelinePos(idea),
    scale: [0, Number(oy.toFixed(3)), Number(oz.toFixed(3))]
  }
}

function ideaTimelinePos(idea) {
  const x = (idea.year - 1600) * 3.2
  const branchIdx = Object.keys(BRANCHES).indexOf(idea.branch)
  const z = (branchIdx - 2.5) * 130
  const r = mulberry32(hashString(`${idea.id}:timeline`))
  return [Number(x.toFixed(3)), Number((r() * 50 - 25).toFixed(3)), Number((z + r() * 16 - 8).toFixed(3))]
}

function hashString(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

function warnCapacity(kind, count, capacity) {
  const ratio = count / capacity
  if (ratio >= 0.9) {
    console.warn(`atlas: ${kind} buffer at ${(ratio * 100).toFixed(0)}% (${count}/${capacity}); auto-prune recommended`)
  } else if (ratio >= 0.75) {
    console.info(`atlas: ${kind} buffer at ${(ratio * 100).toFixed(0)}%`)
  }
}

function spliceLabelForIdea(idea) {
  const el = document.createElement('div')
  el.className = 'star-label star-label--idea'
  el.textContent = idea.name
  el.style.opacity = '0'
  const obj = new CSS2DObject(el)
  obj.position.set(idea.pos.galaxy[0], idea.pos.galaxy[1], idea.pos.galaxy[2])
  labels.group.add(obj)
}

if (import.meta.env.DEV) {
  window.__atlas = {
    rig,
    camera: stage.camera,
    hover,
    card,
    ideaCard,
    ideatePanel,
    apiBanner,
    theoryStars,
    ideaStars,
    lineage,
    switchLens,
    resetAtlasView,
    runIdeation,
    starsData,
    edgesLive,
    starsById,
    step(n = 1, dt = 1 / 60) {
      for (let i = 0; i < n; i += 1) tick(dt)
      return Math.round(rig.radius)
    }
  }
}

renderLanguageChrome()
onLanguageChange(renderLanguageChrome)

// ── FPS overlay ───────────────────────────────────────────────────────────
const fpsEl = document.getElementById('fps')
const debug = params.has('debug')
if (debug) fpsEl.style.display = 'block'
let frames = 0
let fpsTimer = 0


// ── Main loop ─────────────────────────────────────────────────────────────
const clock = new THREE.Clock()
let simTime = 0
// EC-15: skip the intro animation entirely when the user prefers reduced motion.
let introClock = reducedMotion ? 7 : 0
const prevCamPos = stage.camera.position.clone()

function introStage(from, dur) {
  // EC-15: if the user prefers reduced motion, treat the intro as already
  // complete (everything stays at full opacity / visibility).
  if (reducedMotion) return 1
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
    stage.camera.position.distanceToSquared(prevCamPos) >
    radius * radius * 4e-6
  prevCamPos.copy(stage.camera.position)

  const focusDim = hover.update(dt)

  if (lensAnim) {
    lensAnim.t = Math.min(1, lensAnim.t + dt / 2.2)
    const lt = lensAnim.t
    theoryStars.setLensProgress(lt)
    ideaStars.setLensProgress(lt)
    lineage.setLensProgress(lt)
    labels.setLensProgress(lt)
    if (lt >= 1) {
      theoryStars.commitLens()
      ideaStars.commitLens()
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
  } else if (reducedMotion) {
    // EC-15: keep the shaders at full intro value forever (the fade-in is off).
    backdrop.setIntro(1)
    theoryStars.setIntro(1)
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
  ideaStars.update(t)
  lineage.update(t, lineReveal)
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
