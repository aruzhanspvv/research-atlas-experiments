import * as THREE from 'three'
import { PIXEL_RATIO } from '../utils/display.js'

// Node stars: papers AND ideas rendered as one instanced Points layer, so
// both species visually belong to the same starfield (per user requirement:
// "papers AND generated ideas are both nodes/stars"). Papers keep the
// physics-atlas star look (white-hot core + topic-color halo + diffraction
// spikes for high-influence papers). Ideas get an ADDITIONAL pulsing
// "novelty aura" ring — a second, larger, breathing halo whose size/color/
// pulse-rate are driven by noveltyScore, layered behind the core so an idea
// still reads as "a star" but with an unmistakable second visual signal.
// This satisfies EVAL_PLAN N2 (must not be a plain number/badge) — the aura
// animates in real time and is orthogonal (color axis + motion) to the
// topic-hue core, so it can never be mistaken for "just a recolored dot".

const INFLUENCE_SIZE = { 1: 30, 2: 40, 3: 54, 4: 78, 5: 120 }
const IDEA_BASE_SIZE = 46 // ideas render at a fixed mid-size dot before aura enlargement

// Capacity headroom (approved in contract §6): buffers are pre-allocated
// larger than the initial node count so newly generated nodes (live
// UC2/UC3 flows) can be appended without a full geometry rebuild — only a
// drawRange bump + a few attribute writes, which is cheap and keeps the
// "new star fades in" animation smooth.
function computeCapacity(n) {
  return Math.max(Math.ceil(n * 1.6), n + 40)
}

export function createNodeStars(nodesData, topicMeta) {
  const initialCount = nodesData.length
  const capacity = computeCapacity(initialCount)

  const positions = new Float32Array(capacity * 3)
  const colors = new Float32Array(capacity * 3)
  const sizes = new Float32Array(capacity)
  const pulses = new Float32Array(capacity)
  const phases = new Float32Array(capacity)
  const types = new Float32Array(capacity) // 0 = paper, 1 = idea
  const novelties = new Float32Array(capacity)
  const births = new Float32Array(capacity).fill(-999) // -999 => always fully visible

  const color = new THREE.Color()
  const idByIndex = new Array(capacity)

  function writeNode(i, node) {
    const [x, y, z] = node.pos.galaxy
    positions[i * 3] = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z

    const primaryTopic = (node.topics ?? [])[0]
    const meta = primaryTopic ? topicMeta.get(primaryTopic) : null
    color.set(meta ? meta.color : '#8fa0c8')
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b

    const isIdea = node.type === 'idea'
    types[i] = isIdea ? 1 : 0
    sizes[i] = isIdea ? IDEA_BASE_SIZE : (INFLUENCE_SIZE[node.influence] ?? 34)
    novelties[i] = isIdea ? (node.noveltyScore ?? 0) : 0
    pulses[i] = node.frontier ? 1 : 0 // "trending" flag reuses the old frontier pulse
    phases[i] = (i * 0.618) % 1
    idByIndex[i] = node.id
  }

  nodesData.forEach((node, i) => writeNode(i, node))

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geo.setAttribute('aPulse', new THREE.BufferAttribute(pulses, 1))
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
  geo.setAttribute('aType', new THREE.BufferAttribute(types, 1))
  geo.setAttribute('aNovelty', new THREE.BufferAttribute(novelties, 1))
  geo.setAttribute('aBirth', new THREE.BufferAttribute(births, 1))

  const keeps = new Float32Array(capacity)
  const keepAttr = new THREE.BufferAttribute(keeps, 1)
  geo.setAttribute('aKeep', keepAttr)

  const posTo = new Float32Array(positions)
  const posToAttr = new THREE.BufferAttribute(posTo, 3)
  geo.setAttribute('aPosTo', posToAttr)

  geo.setDrawRange(0, initialCount)

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
      attribute float aType;
      attribute float aNovelty;
      attribute float aBirth;
      attribute vec3 aPosTo;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uLensT;
      varying vec3 vColor;
      varying float vBig;
      varying float vKeep;
      varying float vType;
      varying float vNovelty;
      varying float vPhase;
      varying float vAge;

      void main() {
        vColor = aColor;
        vBig = smoothstep(40.0, 110.0, aSize);
        vKeep = aKeep;
        vType = aType;
        vNovelty = aNovelty;
        vPhase = aPhase;
        // Fade-in for freshly-inserted live nodes (aBirth set at insertion time).
        vAge = aBirth < -100.0 ? 1.0 : clamp((uTime - aBirth) / 1.1, 0.0, 1.0);

        float pulse = 1.0 + aPulse * 0.04 * sin(uTime * 1.25 + aPhase * 6.2831);
        float lt = smoothstep(0.0, 1.0, clamp(uLensT * 1.35 - aPhase * 0.35, 0.0, 1.0));
        vec3 pos = mix(position, aPosTo, lt);
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mv;

        // Ideas render at an enlarged sprite so the novelty aura ring (drawn
        // in the fragment shader, out near the sprite edge) has room —
        // aura reach scales directly with noveltyScore.
        float auraScale = mix(1.0, 1.7 + aNovelty * 1.7, aType);
        gl_PointSize = clamp(aSize * auraScale * pulse * uPixelRatio * (620.0 / -mv.z), 2.0, 620.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uSpike;
      uniform float uHalo;
      uniform float uCoreHeat;
      uniform float uFocus;
      uniform float uIntro;
      uniform float uTime;
      varying vec3 vColor;
      varying float vBig;
      varying float vKeep;
      varying float vType;
      varying float vNovelty;
      varying float vPhase;
      varying float vAge;

      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;

        float edge = smoothstep(1.0, 0.72, r);

        // Core: identical for both species — a paper and an idea are both
        // fundamentally "stars" in this map.
        float core = exp(-r * r * 42.0);
        float halo = exp(-r * 3.2) * 0.55 + exp(-r * 8.0) * 0.5;
        float sx = pow(max(0.0, 1.0 - abs(p.y)), 60.0) * exp(-abs(p.x) * 2.4);
        float sy = pow(max(0.0, 1.0 - abs(p.x)), 60.0) * exp(-abs(p.y) * 2.4);
        float spikes = (sx + sy) * uSpike * vBig * 1.1 * (1.0 - vType); // spikes only on papers

        vec3 hot = mix(vColor, vec3(1.0, 0.98, 0.94), uCoreHeat);
        vec3 col = hot * core * (1.7 + vBig * 1.4)
                 + vColor * halo * uHalo * (1.0 + vBig * 0.6)
                 + mix(vColor, vec3(1.0), 0.6) * spikes;
        float alpha = (core + halo * 0.6 * uHalo + spikes) * edge;

        // —— Novelty aura (ideas only): a second, larger, breathing ring ——
        // Distinct color axis (cool violet -> hot cyan-white, independent of
        // topic hue) and distinct animation (pulse frequency scales with
        // score) so this can never read as "just a recolored star" or a
        // static badge — it is a live, score-driven visual signal.
        if (vType > 0.5) {
          float ringR = mix(0.34, 0.82, vNovelty);
          float ringWidth = 0.16;
          float ringShape = exp(-pow((r - ringR) / ringWidth, 2.0));
          float pulseFreq = 0.6 + vNovelty * 1.6;
          float pulse = 0.55 + 0.45 * sin(uTime * pulseFreq + vPhase * 6.2831);
          vec3 auraColor = mix(vec3(0.55, 0.35, 0.95), vec3(0.55, 0.95, 1.0), vNovelty);
          float auraAlpha = ringShape * pulse * (0.55 + vNovelty * 0.65) * edge;
          col += auraColor * auraAlpha * 1.8;
          alpha += auraAlpha;
        }

        float focusMul = mix(1.0, mix(0.16, 1.25, vKeep), uFocus) * uIntro;
        alpha *= focusMul * vAge;
        gl_FragColor = vec4(col * edge * focusMul * vAge, alpha);
      }
    `
  })

  const points = new THREE.Points(geo, material)
  points.frustumCulled = false

  function applyPreset(preset) {
    material.uniforms.uSpike.value = preset.stars.spike
    material.uniforms.uHalo.value = preset.stars.halo
    material.uniforms.uCoreHeat.value = preset.stars.coreHeat
  }

  let focusTarget = 0
  let lastT = 0
  let liveCount = initialCount

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
  }

  function beginLens(targets) {
    posTo.set(targets, 0)
    posToAttr.needsUpdate = true
  }
  function setLensProgress(v) {
    material.uniforms.uLensT.value = v
  }
  function commitLens() {
    geo.attributes.position.array.set(posTo.subarray(0, liveCount * 3))
    geo.attributes.position.needsUpdate = true
    material.uniforms.uLensT.value = 0
  }

  // —— Live insertion API (capacity headroom, no geometry rebuild) ——
  // Returns the new node's buffer index, or null if capacity is exhausted
  // (caller should treat this as "needs a full rebuild", which we avoid by
  // sizing capacity generously up front; not expected in normal sessions).
  function addNode(node) {
    if (liveCount >= capacity) {
      console.warn('[nodeStars] capacity exhausted, cannot add node without rebuild:', node.id)
      return null
    }
    const i = liveCount
    writeNode(i, node)
    births[i] = material.uniforms.uTime.value // fade in from "now"
    posTo[i * 3] = positions[i * 3]
    posTo[i * 3 + 1] = positions[i * 3 + 1]
    posTo[i * 3 + 2] = positions[i * 3 + 2]
    liveCount += 1
    geo.setDrawRange(0, liveCount)
    ;['position', 'aColor', 'aSize', 'aPulse', 'aPhase', 'aType', 'aNovelty', 'aBirth', 'aKeep', 'aPosTo'].forEach(
      (name) => {
        geo.attributes[name].needsUpdate = true
      }
    )
    return i
  }

  function indexOf(id) {
    return idByIndex.indexOf(id)
  }

  return {
    object: points,
    update,
    applyPreset,
    setFocus,
    beginLens,
    setLensProgress,
    commitLens,
    addNode,
    indexOf,
    get liveCount() { return liveCount },
    get capacity() { return capacity },
    setIntro(v) {
      material.uniforms.uIntro.value = v
    }
  }
}
