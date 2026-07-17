import * as THREE from 'three'
import { BRANCHES } from '../data/branches.js'
import { PIXEL_RATIO } from '../utils/display.js'

// 理论恒星层：大小/亮度 = 影响力，颜色 = 学科。
// 白热核心 + 学科色光晕 + 衍射星芒；前沿理论缓慢脉动，经典沉稳。
//
// Pre-allocated MAX_STARS headroom (≥50× current density) — supports live
// insertion without scene rebuild. `addStar/removeStar/setStar` API below.

const MAX_STARS = 4096
const INFLUENCE_SIZE = { 1: 38, 2: 50, 3: 68, 4: 98, 5: 152 }

export function createTheoryStars(initialStars) {
  const positions = new Float32Array(MAX_STARS * 3)
  const colors = new Float32Array(MAX_STARS * 3)
  const sizes = new Float32Array(MAX_STARS)
  const pulses = new Float32Array(MAX_STARS)
  const phases = new Float32Array(MAX_STARS)
  const visibility = new Float32Array(MAX_STARS)   // 0 = hidden, 1 = shown (used as fade-in multiplier)

  // Build initial population (live count starts at initialStars.length)
  let liveCount = 0
  const color = new THREE.Color()
  for (let i = 0; i < initialStars.length && i < MAX_STARS; i += 1) {
    const s = initialStars[i]
    // `s.pos` is the lens-keyed object `{galaxy:[..], timeline:[..], scale:[..]}`.
    // Initialise the GPU `position` buffer from the default (galaxy) lens so the
    // bounding-sphere is valid on the very first frame and paper Points render
    // immediately at boot — no need to wait for the first lens switch.
    const p0 = s.pos?.galaxy ?? [0, 0, 0]
    positions[i * 3] = p0[0]
    positions[i * 3 + 1] = p0[1]
    positions[i * 3 + 2] = p0[2]
    color.set(BRANCHES[s.branch]?.color ?? '#ffffff')
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
    sizes[i] = INFLUENCE_SIZE[s.influence] ?? 34
    pulses[i] = s.frontier ? 1 : 0
    phases[i] = (i * 0.618) % 1
    visibility[i] = 1
    liveCount += 1
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geo.setAttribute('aPulse', new THREE.BufferAttribute(pulses, 1))
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
  geo.setAttribute('aVisible', new THREE.BufferAttribute(visibility, 1))

  const keeps = new Float32Array(MAX_STARS)
  const keepAttr = new THREE.BufferAttribute(keeps, 1)
  geo.setAttribute('aKeep', keepAttr)

  // 透镜切换：目标坐标槽。Allocate independently and seed with the real galaxy
  // positions (not a copy of `positions`, which would propagate any NaN into
  // both buffers and re-trigger the bounding-sphere error at boot).
  const posTo = new Float32Array(MAX_STARS * 3)
  for (let i = 0; i < initialStars.length && i < MAX_STARS; i += 1) {
    const p1 = initialStars[i].pos?.galaxy ?? [0, 0, 0]
    posTo[i * 3] = p1[0]
    posTo[i * 3 + 1] = p1[1]
    posTo[i * 3 + 2] = p1[2]
  }
  const posToAttr = new THREE.BufferAttribute(posTo, 3)
  geo.setAttribute('aPosTo', posToAttr)

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: PIXEL_RATIO },
      uSpike: { value: 1 },
      uHalo: { value: 1 },
      uCoreHeat: { value: 0.8 },
      uFocus: { value: 0 },
      uLensT: { value: 0 },
      uIntro: { value: 1 }
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aPulse;
      attribute float aPhase;
      attribute float aKeep;
      attribute vec3 aPosTo;
      attribute float aVisible;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uLensT;
      varying vec3 vColor;
      varying float vBig;
      varying float vKeep;
      varying float vVisible;

      void main() {
        vColor = aColor;
        vBig = smoothstep(40.0, 110.0, aSize);
        vKeep = aKeep;
        vVisible = aVisible;
        float pulse = 1.0 + aPulse * 0.04 * sin(uTime * 1.25 + aPhase * 6.2831);
        float lt = smoothstep(0.0, 1.0, clamp(uLensT * 1.35 - aPhase * 0.35, 0.0, 1.0));
        vec3 pos = mix(position, aPosTo, lt);
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aSize * pulse * uPixelRatio * (620.0 / -mv.z), 2.0, 380.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uSpike;
      uniform float uHalo;
      uniform float uCoreHeat;
      uniform float uFocus;
      uniform float uIntro;
      varying vec3 vColor;
      varying float vBig;
      varying float vKeep;
      varying float vVisible;

      void main() {
        if (vVisible < 0.01) discard;
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;
        float edge = smoothstep(1.0, 0.72, r);
        float core = exp(-r * r * 42.0);
        float halo = exp(-r * 3.2) * 0.55 + exp(-r * 8.0) * 0.5;
        float sx = pow(max(0.0, 1.0 - abs(p.y)), 60.0) * exp(-abs(p.x) * 2.4);
        float sy = pow(max(0.0, 1.0 - abs(p.x)), 60.0) * exp(-abs(p.y) * 2.4);
        float spikes = (sx + sy) * uSpike * vBig * 1.1;
        vec3 hot = mix(vColor, vec3(1.0, 0.98, 0.94), uCoreHeat);
        vec3 col = hot * core * (1.7 + vBig * 1.4)
                 + vColor * halo * uHalo * (1.0 + vBig * 0.6)
                 + mix(vColor, vec3(1.0), 0.6) * spikes;
        float focusMul = mix(1.0, mix(0.16, 1.25, vKeep), uFocus) * uIntro;
        float vis = vVisible;
        float alpha = (core + halo * 0.6 * uHalo + spikes) * edge * focusMul * vis;
        gl_FragColor = vec4(col * edge * focusMul * vis, alpha);
      }
    `
  })

  const points = new THREE.Points(geo, material)
  points.frustumCulled = false
  // Draw order so idea layer (added separately) sits on top of papers.
  points.renderOrder = 1

  function applyPreset(preset) {
    material.uniforms.uSpike.value = preset.stars.spike
    material.uniforms.uHalo.value = preset.stars.halo
    material.uniforms.uCoreHeat.value = preset.stars.coreHeat
  }

  let focusTarget = 0
  let lastT = 0

  function setFocus(keepIndices) {
    focusTarget = keepIndices ? 1 : 0
    if (keepIndices) {
      for (let i = 0; i < liveCount; i += 1) keeps[i] = keepIndices.has(i) ? 1 : 0
      keepAttr.needsUpdate = true
    }
  }

  function update(t) {
    const dt = Math.min(t - lastT, 0.05)
    lastT = t
    material.uniforms.uTime.value = t
    const u = material.uniforms.uFocus
    u.value += (focusTarget - u.value) * Math.min(1, dt * 7)
    // Drive fade-in: visibility approaches 1 at ~3/s (3s fade).
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

  // —— Live insertion API ——
  // Returns the index the star was placed at, or -1 if at capacity.
  function addStar(star) {
    if (liveCount >= MAX_STARS) return -1
    const i = liveCount
    const pos = star.pos?.galaxy ?? [0, 0, 0]
    positions[i * 3] = pos[0]
    positions[i * 3 + 1] = pos[1]
    positions[i * 3 + 2] = pos[2]
    color.set(BRANCHES[star.branch]?.color ?? '#ffffff')
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
    sizes[i] = INFLUENCE_SIZE[star.influence] ?? 34
    pulses[i] = star.frontier ? 1 : 0
    phases[i] = (i * 0.618) % 1
    visibility[i] = 0   // fade-in from 0 → 1 in update()
    // posTo defaults to position so lens transitions don't snap to (0,0,0)
    posTo[i * 3] = positions[i * 3]
    posTo[i * 3 + 1] = positions[i * 3 + 1]
    posTo[i * 3 + 2] = positions[i * 3 + 2]
    keeps[i] = 0
    geo.attributes.position.needsUpdate = true
    geo.attributes.aColor.needsUpdate = true
    geo.attributes.aSize.needsUpdate = true
    geo.attributes.aPulse.needsUpdate = true
    geo.attributes.aPhase.needsUpdate = true
    geo.attributes.aVisible.needsUpdate = true
    geo.attributes.aPosTo.needsUpdate = true
    keepAttr.needsUpdate = true
    geo.setDrawRange(0, liveCount + 1)
    liveCount += 1
    return i
  }

  function getStar(index) {
    return index >= 0 && index < liveCount ? { index, pos: { galaxy: [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]] } } : null
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

  return {
    object: points,
    update,
    applyPreset,
    setFocus,
    beginLens,
    setLensProgress,
    commitLens,
    addStar,
    setPosition,
    get count() { return liveCount },
    get capacity() { return MAX_STARS },
    setIntro(v) { material.uniforms.uIntro.value = v }
  }
}
