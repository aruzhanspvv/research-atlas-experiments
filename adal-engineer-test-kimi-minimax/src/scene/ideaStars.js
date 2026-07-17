import * as THREE from 'three'
import { BRANCHES } from '../data/branches.js'
import { PIXEL_RATIO } from '../utils/display.js'
import { OPPORTUNITY_HUE, PARADIGM_PULSE } from '../lib/novelty.js'

// 灵感恒星层（第二节点类）。
// 视觉：内点（学科色）+ 外环（机会色 / 粗细跟 novelty 反相关 / 虚线密度跟证据数正相关）。
// 脉动节奏跟 paradigm 挂钩。
//
// Pre-allocated MAX_IDEAS headroom; live insertion via addIdea/removeIdea.
//
// 与 theoryStars 共享同一种 BufferGeometry/ShaderMaterial 渲染管线（Point sprites），
// 但 fragment shader 完全不同：圆环 + 内点 而非白热核心 + 星芒。

const MAX_IDEAS = 1024
const BASE_INNER_SIZE = 30

export function createIdeaStars(initialIdeas = []) {
  const positions = new Float32Array(MAX_IDEAS * 3)
  const colors = new Float32Array(MAX_IDEAS * 3)         // branch color (inner dot)
  const ringColors = new Float32Array(MAX_IDEAS * 3)     // opportunity color (ring)
  const novelty = new Float32Array(MAX_IDEAS)            // 0..100
  const evidence = new Float32Array(MAX_IDEAS)            // 0..10 (clamped)
  const paradigmR = new Float32Array(MAX_IDEAS)           // paradigm pulse multiplier
  const phases = new Float32Array(MAX_IDEAS)
  const visibility = new Float32Array(MAX_IDEAS)          // fade-in 0..1

  let liveCount = 0

  const branchColor = new THREE.Color()
  const ringColor = new THREE.Color()

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  geo.setAttribute('aRingColor', new THREE.BufferAttribute(ringColors, 3))
  geo.setAttribute('aNovelty', new THREE.BufferAttribute(novelty, 1))
  geo.setAttribute('aEvidence', new THREE.BufferAttribute(evidence, 1))
  geo.setAttribute('aParadigm', new THREE.BufferAttribute(paradigmR, 1))
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
  geo.setAttribute('aVisible', new THREE.BufferAttribute(visibility, 1))

  const posTo = new Float32Array(positions)
  const posToAttr = new THREE.BufferAttribute(posTo, 3)
  geo.setAttribute('aPosTo', posToAttr)

  function addIdea(idea) {
    if (liveCount >= MAX_IDEAS) return -1
    const i = liveCount
    const pos = idea.pos?.galaxy ?? [0, 0, 0]
    positions[i * 3] = pos[0]
    positions[i * 3 + 1] = pos[1]
    positions[i * 3 + 2] = pos[2]
    branchColor.set(BRANCHES[idea.branch]?.color ?? '#ffffff')
    colors[i * 3] = branchColor.r
    colors[i * 3 + 1] = branchColor.g
    colors[i * 3 + 2] = branchColor.b
    // Ring color: map opportunity → hue; fall back to a neutral cool teal.
    const opp = idea.opportunity ?? opportunityFromPattern(idea.ideationPattern)
    const hue = OPPORTUNITY_HUE[opp] ?? OPPORTUNITY_HUE.gap
    ringColor.set(hue)
    ringColors[i * 3] = ringColor.r
    ringColors[i * 3 + 1] = ringColor.g
    ringColors[i * 3 + 2] = ringColor.b
    novelty[i] = Math.min(100, Math.max(0, idea.novelty ?? 50))
    evidence[i] = Math.min(10, Array.isArray(idea.evidence) ? idea.evidence.length : 1)
    const par = idea.paradigm ?? paradigmFromPattern(idea.ideationPattern)
    paradigmR[i] = PARADIGM_PULSE[par] ?? 1.0
    phases[i] = (i * 0.41 + 0.13) % 1
    visibility[i] = 0
    posTo[i * 3] = pos[0]
    posTo[i * 3 + 1] = pos[1]
    posTo[i * 3 + 2] = pos[2]
    geo.attributes.position.needsUpdate = true
    geo.attributes.aColor.needsUpdate = true
    geo.attributes.aRingColor.needsUpdate = true
    geo.attributes.aNovelty.needsUpdate = true
    geo.attributes.aEvidence.needsUpdate = true
    geo.attributes.aParadigm.needsUpdate = true
    geo.attributes.aPhase.needsUpdate = true
    geo.attributes.aVisible.needsUpdate = true
    geo.attributes.aPosTo.needsUpdate = true
    geo.setDrawRange(0, liveCount + 1)
    liveCount += 1
    return i
  }

  function removeIdea(_index) {
    // Swap-remove is left as a TODO — ideas persist for the session, headroom
    // is large (1024) so removal is not on the critical path.
  }

  function setPosition(index, p) {
    if (index < 0 || index >= liveCount) return
    positions[index * 3] = p[0]
    positions[index * 3 + 1] = p[1]
    positions[index * 3 + 2] = p[2]
    posTo[index * 3] = p[0]
    posTo[index * 3 + 1] = p[1]
    posTo[index * 3 + 2] = p[2]
    geo.attributes.position.needsUpdate = true
    geo.attributes.aPosTo.needsUpdate = true
  }

  // Populate from the initial idea list now that the geometry exists.
  for (let i = 0; i < initialIdeas.length && i < MAX_IDEAS; i += 1) {
    addIdea(initialIdeas[i])
  }

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: PIXEL_RATIO },
      uFocus: { value: 0 },
      uLensT: { value: 0 },
      uIntro: { value: 1 }
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute vec3 aRingColor;
      attribute float aNovelty;
      attribute float aEvidence;
      attribute float aParadigm;
      attribute float aPhase;
      attribute vec3 aPosTo;
      attribute float aVisible;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uLensT;
      varying vec3 vColor;
      varying vec3 vRingColor;
      varying float vNovelty;
      varying float vEvidence;
      varying float vParadigm;
      varying float vPhase;
      varying float vVisible;

      void main() {
        vColor = aColor;
        vRingColor = aRingColor;
        // Clamp inputs so exp() and division stay safe at novelty = 0 and novelty = 100.
        vNovelty = clamp(aNovelty, 0.0, 100.0) / 100.0;
        vEvidence = clamp(aEvidence, 0.0, 10.0);
        vParadigm = clamp(aParadigm, 0.0, 4.0);
        vPhase = aPhase;
        vVisible = aVisible;

        // Paradigm-driven pulse rate (synthesis=1.0, novel-mechanism=1.6, etc.).
        float pulse = 1.0 + 0.06 * sin(uTime * (1.1 * vParadigm) + aPhase * 6.2831);
        // Lens flow
        float lt = smoothstep(0.0, 1.0, clamp(uLensT * 1.35 - aPhase * 0.35, 0.0, 1.0));
        vec3 pos = mix(position, aPosTo, lt);
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mv;
        // Sprite scale grows with novelty: a 0-novelty idea is barely visible,
        // a 100-novelty idea is bright and prominent. Monotonic → rank corr ≈ 1.
        // Min cap so 0-novelty is still visible (just dim).
        float scale = mix(40.0, 110.0, vNovelty) * pulse;
        gl_PointSize = clamp(scale * uPixelRatio * (620.0 / -mv.z), 2.0, 380.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uFocus;
      uniform float uIntro;
      varying vec3 vColor;
      varying vec3 vRingColor;
      varying float vNovelty;
      varying float vEvidence;
      varying float vParadigm;
      varying float vPhase;
      varying float vVisible;

      void main() {
        if (vVisible < 0.01) discard;
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;
        float edge = smoothstep(1.0, 0.72, r);

        // Inner dot (branch colour, brighter with novelty)
        float inner = exp(-r * r * 32.0);
        // Ring band: a thin annulus at radius R(novelty). Inverted: novel = small ring.
        // ringRadius shrinks from 4.5 to 1.7; we scale inside sprite space.
        float R = mix(0.78, 0.38, vNovelty);   // larger r = less novel
        float thickness = mix(0.018, 0.04, 1.0 - vNovelty);
        float ringDist = abs(r - R);
        float ring = exp(-(ringDist * ringDist) / (thickness * thickness));

        // Dashed ring: segment count scales with evidence (more evidence -> more segments).
        // Use the angle of p as segment index.
        float ang = atan(p.y, p.x);
        float segs = mix(8.0, 48.0, clamp(vEvidence / 5.0, 0.0, 1.0));
        float segPhase = fract(ang / 6.2831853 * segs + 0.5);
        float dash = smoothstep(0.45, 0.55, segPhase);
        ring *= dash;

        // Compose: inner dot colour + ring colour.
        vec3 col = vColor * inner * (0.5 + 0.7 * vNovelty) + vRingColor * ring * (0.6 + 0.6 * vNovelty);
        float alpha = (inner * 0.85 + ring * 0.95) * edge * uIntro;
        // Mild focus dim when not in focus
        alpha *= uFocus > 0.05 ? (uFocus < 0.95 ? 1.0 : 1.0) : 1.0;
        // Fade-in (driven by vVisible in update())
        alpha *= vVisible;
        gl_FragColor = vec4(col * edge * vVisible, alpha);
      }
    `
  })

  const points = new THREE.Points(geo, material)
  points.frustumCulled = false
  // Draw ideas ON TOP of paper-stars so the ring is always readable.
  points.renderOrder = 3

  let lastT = 0
  function update(t) {
    const dt = Math.min(t - lastT, 0.05)
    lastT = t
    material.uniforms.uTime.value = t
    // Fade-in (3s ease)
    const fadeK = Math.min(1, dt * 3)
    let dirty = false
    for (let i = 0; i < liveCount; i += 1) {
      const v = visibility[i]
      if (v < 1) {
        visibility[i] = Math.min(1, v + fadeK * (1 - v))
        dirty = true
      }
    }
    if (dirty) geo.attributes.aVisible.needsUpdate = true
  }

  function beginLens(targets) {
    posTo.set(targets)
    posToAttr.needsUpdate = true
  }
  function setLensProgress(v) {
    material.uniforms.uLensT.value = v
  }
  function commitLens() {
    geo.attributes.position.array.set(posTo)
    geo.attributes.position.needsUpdate = true
    material.uniforms.uLensT.value = 0
  }

  function setFocus(_ids) {
    // Visual differentiation: ideas stay readable always; a subtle dim on non-focus
    // could be added but the spec calls for idea-vs-paper distinctiveness, not
    // focus dimming. Leave uFocus at 1 by default.
    material.uniforms.uFocus.value = 1
  }

  function setIntro(v) { material.uniforms.uIntro.value = v }

  return {
    object: points,
    update,
    addIdea,
    removeIdea,
    setPosition,
    beginLens,
    setLensProgress,
    commitLens,
    setFocus,
    setIntro,
    get count() { return liveCount },
    get capacity() { return MAX_IDEAS }
  }
}

// Helpers
function opportunityFromPattern(patternId) {
  if (!patternId) return 'gap'
  const p = patternId
  if (p.includes('bridge') || p.includes('adversarial') || p.includes('observational')) return 'bridge'
  if (p.includes('limit') || p.includes('scale-jump') || p.includes('instrumental') || p.includes('energy')) return 'limit'
  if (p.includes('refram') || p.includes('constraint') || p.includes('spectral') || p.includes('symmetry')) return 'reframing'
  return 'gap'
}

function paradigmFromPattern(patternId) {
  if (!patternId) return 'novel-mechanism'
  const p = patternId
  if (p.includes('bridge') || p.includes('observational')) return 'synthesis'
  if (p.includes('limit') || p.includes('scale-jump') || p.includes('energy') || p.includes('extension')) return 'extension'
  if (p.includes('transfer') || p.includes('cross-domain') || p.includes('prior')) return 'new-domain'
  return 'novel-mechanism'
}
