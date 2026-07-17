import * as THREE from 'three'
import { BRANCHES } from '../data/sources.js'
import { PIXEL_RATIO } from '../utils/display.js'

// Star layer for the atlas: papers render as ordinary theory-stars (size =
// influence, color = source). Idea nodes get an extra pulsing novelty ring —
// radius and speed both scale with the novelty score, so a 95-novelty idea
// visibly throbs while a 20-novelty idea sits nearly still. This is the
// "distinctive visualization" for the novelty score the brief calls for.

const INFLUENCE_SIZE = { 1: 40, 2: 62, 3: 92, 4: 130 }

export function createNodes(nodeData) {
  const n = nodeData.length
  const positions = new Float32Array(n * 3)
  const colors = new Float32Array(n * 3)
  const sizes = new Float32Array(n)
  const pulses = new Float32Array(n)
  const phases = new Float32Array(n)
  const isIdea = new Float32Array(n)
  const novelty = new Float32Array(n)

  const color = new THREE.Color()
  nodeData.forEach((s, i) => {
    positions[i * 3] = s.pos[0]
    positions[i * 3 + 1] = s.pos[1]
    positions[i * 3 + 2] = s.pos[2]
    color.set(BRANCHES[s.branch].color)
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
    sizes[i] = INFLUENCE_SIZE[s.influence] ?? 40
    pulses[i] = s.type === 'idea' ? 1 : 0
    phases[i] = (i * 0.618) % 1
    isIdea[i] = s.type === 'idea' ? 1 : 0
    novelty[i] = (s.noveltyScore ?? 0) / 100
  })

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geo.setAttribute('aPulse', new THREE.BufferAttribute(pulses, 1))
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
  geo.setAttribute('aIsIdea', new THREE.BufferAttribute(isIdea, 1))
  geo.setAttribute('aNovelty', new THREE.BufferAttribute(novelty, 1))

  const keeps = new Float32Array(n)
  const keepAttr = new THREE.BufferAttribute(keeps, 1)
  geo.setAttribute('aKeep', keepAttr)

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
      uIntro: { value: 1 }
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aPulse;
      attribute float aPhase;
      attribute float aKeep;
      attribute float aIsIdea;
      attribute float aNovelty;
      uniform float uTime;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vBig;
      varying float vKeep;
      varying float vIsIdea;
      varying float vNovelty;
      varying float vPhase;

      void main() {
        vColor = aColor;
        vBig = smoothstep(40.0, 110.0, aSize);
        vKeep = aKeep;
        vIsIdea = aIsIdea;
        vNovelty = aNovelty;
        vPhase = aPhase;
        // Idea stars breathe faster and harder the more novel they are.
        float pulseAmp = mix(0.04, 0.16, aNovelty) * aPulse;
        float pulseSpeed = mix(1.0, 2.6, aNovelty);
        float pulse = 1.0 + pulseAmp * sin(uTime * pulseSpeed + aPhase * 6.2831);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float ringPad = aIsIdea * (1.6 + aNovelty * 1.8); // room for the novelty ring
        gl_PointSize = clamp(aSize * pulse * (1.0 + ringPad * 0.35) * uPixelRatio * (620.0 / -mv.z), 2.0, 460.0);
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
      varying float vIsIdea;
      varying float vNovelty;
      varying float vPhase;

      void main() {
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
        float alpha = (core + halo * 0.6 * uHalo + spikes) * edge;

        // Novelty ring: idea nodes only. A thin bright ring orbits outside the
        // core, radius/brightness/speed all driven by the novelty score, so
        // novelty reads instantly as "how alive is this halo".
        if (vIsIdea > 0.5) {
          float ringR = 0.42 + vNovelty * 0.4;
          float ringW = 0.05 + vNovelty * 0.02;
          float ring = exp(-pow((r - ringR) / ringW, 2.0));
          float sweepAng = atan(p.y, p.x);
          float sweep = 0.55 + 0.45 * sin(sweepAng * 3.0 - uTime * (1.2 + vNovelty * 2.2) + vPhase * 6.2831);
          float ringAlpha = ring * sweep * (0.5 + vNovelty * 0.9);
          vec3 ringCol = mix(vec3(1.0, 0.5, 0.95), vec3(1.0, 0.92, 0.98), vNovelty);
          col += ringCol * ringAlpha * 2.2;
          alpha = max(alpha, ringAlpha);
        }

        float focusMul = mix(1.0, mix(0.16, 1.25, vKeep), uFocus) * uIntro;
        gl_FragColor = vec4(col * edge * focusMul, alpha * focusMul);
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

  function setFocus(keepIndices) {
    focusTarget = keepIndices ? 1 : 0
    if (keepIndices) {
      for (let i = 0; i < n; i += 1) keeps[i] = keepIndices.has(i) ? 1 : 0
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

  return {
    object: points,
    update,
    applyPreset,
    setFocus,
    setIntro(v) {
      material.uniforms.uIntro.value = v
    }
  }
}
