import * as THREE from 'three'
import {
  CSS2DRenderer,
  CSS2DObject
} from 'three/examples/jsm/renderers/CSS2DRenderer.js'

// Node title labels: fade in tier-by-tier as camera gets close (high-influence
// papers/ideas first, then mid, then low/long-tail). Pure DOM/CSS, same font
// language as the HUD. English-only (i18n dropped per contract).

function smoothstep(a, b, x) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

const TIER_RANGE = {
  high: [1600, 2400],
  mid: [700, 1050],
  low: [260, 430]
}

function tierFor(node) {
  if (node.type === 'idea') return node.noveltyScore >= 0.6 ? 'high' : 'mid'
  const influence = node.influence ?? 1
  return influence >= 4 ? 'high' : influence === 3 ? 'mid' : 'low'
}

export function createLabels(nodesData, container) {
  const renderer = new CSS2DRenderer()
  renderer.setSize(window.innerWidth, window.innerHeight)
  Object.assign(renderer.domElement.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '5'
  })
  container.appendChild(renderer.domElement)

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  const group = new THREE.Group()
  const items = nodesData.map((node) => {
    const tier = tierFor(node)
    const el = document.createElement('div')
    el.className = `star-label star-label--${tier}`
    el.textContent = node.title
    const obj = new CSS2DObject(el)
    obj.position.set(node.pos.galaxy[0], node.pos.galaxy[1], node.pos.galaxy[2])
    group.add(obj)
    return {
      el,
      obj,
      src: node,
      id: node.id,
      tier,
      influence: node.type === 'idea' ? (node.noveltyScore ?? 0) * 5 : (node.influence ?? 1),
      visible: true,
      suppressed: false,
      lastOpacity: ''
    }
  })

  const byPriority = [...items].sort((a, b) => b.influence - a.influence)

  let frameCount = 0

  function collide(a, b) {
    return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  }

  const LOW_TIER_CAP = 22
  function resolveOverlaps(radius) {
    const placed = []
    let lowShown = 0
    byPriority.forEach((item) => {
      const [near, far] = TIER_RANGE[item.tier]
      const baseOpacity = (1 - smoothstep(near, far, radius)) * 0.9
      const focused = focusIds?.has(item.id) ?? false
      const shown = baseOpacity > 0.02 || focused
      item.suppressed = false
      if (!shown) return
      const r = item.el.getBoundingClientRect()
      if (r.width === 0) return
      const text = { left: r.left - 4, right: r.right + 4, top: r.bottom - 22, bottom: r.bottom + 2 }
      const isLow = item.tier === 'low'
      if (isLow && lowShown >= LOW_TIER_CAP && !(focused && forceFocusedLabels)) {
        item.suppressed = true
        return
      }
      const hit = placed.some((p) => collide(p, text))
      item.suppressed = hit
      if (!hit) {
        placed.push(text)
        if (isLow) lowShown += 1
      }
    })
  }

  let focusIds = null
  let forceFocusedLabels = true
  let unfocusedOpacityScale = 0.15
  function setFocus(ids, options = {}) {
    focusIds = ids
    forceFocusedLabels = options.forceFocusedLabels ?? true
    unfocusedOpacityScale = options.unfocusedOpacityScale ?? 0.15
    frameCount = 3
  }

  function update(radius, cameraMoving = false) {
    frameCount += 1
    if (!cameraMoving && frameCount % 4 === 0) resolveOverlaps(radius)

    items.forEach((item) => {
      const focused = focusIds?.has(item.id) ?? false
      const [near, far] = TIER_RANGE[item.tier]
      let opacity = (1 - smoothstep(near, far, radius)) * 0.9
      if (focusIds) opacity = focused ? 0.95 : opacity * unfocusedOpacityScale
      const visible = opacity > 0.02
      if (visible !== item.visible) {
        item.el.style.visibility = visible ? 'visible' : 'hidden'
        item.obj.visible = visible
        item.visible = visible
      }
      if (visible) {
        const forceFocused = focused && forceFocusedLabels
        const next = item.suppressed && !forceFocused ? '0' : opacity.toFixed(2)
        if (next !== item.lastOpacity) {
          item.el.style.opacity = next
          item.lastOpacity = next
        }
      }
    })
  }

  function render(scene, camera) {
    renderer.render(scene, camera)
  }

  // —— Live insertion: append a label for a newly generated node ——
  function addLabel(node) {
    const tier = tierFor(node)
    const el = document.createElement('div')
    el.className = `star-label star-label--${tier}`
    el.textContent = node.title
    const obj = new CSS2DObject(el)
    obj.position.set(node.pos.galaxy[0], node.pos.galaxy[1], node.pos.galaxy[2])
    group.add(obj)
    const item = {
      el,
      obj,
      src: node,
      id: node.id,
      tier,
      influence: node.type === 'idea' ? (node.noveltyScore ?? 0) * 5 : (node.influence ?? 1),
      visible: true,
      suppressed: false,
      lastOpacity: ''
    }
    items.push(item)
    byPriority.push(item)
    byPriority.sort((a, b) => b.influence - a.influence)
    frameCount = 3
  }

  function beginLens(lensKey) {
    items.forEach((item) => {
      item.from = item.obj.position.clone()
      item.to = new THREE.Vector3(...item.src.pos[lensKey])
    })
  }
  function setLensProgress(t) {
    const e = t * t * (3 - 2 * t)
    items.forEach((item) => {
      if (item.from && item.to) item.obj.position.lerpVectors(item.from, item.to, e)
    })
  }
  function commitLens() {
    items.forEach((item) => {
      if (item.to) item.obj.position.copy(item.to)
      item.from = null
      item.to = null
    })
  }

  return { group, update, render, setFocus, beginLens, setLensProgress, commitLens, addLabel }
}
