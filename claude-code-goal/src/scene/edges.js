import * as THREE from 'three'
import { BRANCHES } from '../data/sources.js'
import { mulberry32 } from '../utils/prng.js'

// Connection filaments: solid = grounding (an idea cites a specific paper as
// evidence), dashed = inspiration (a looser, non-grounding relationship
// between two ideas, or between two related papers). A light packet flows
// from source (the paper) toward the idea it grounds, so hovering an idea
// visibly shows evidence flowing in from its supporting literature.

const SEGMENTS = 22

function edgeCurve(a, b) {
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
  const dist = a.distanceTo(b)
  const out = mid.clone().setY(0).normalize()
  mid.addScaledVector(new THREE.Vector3(0, 1, 0), dist * 0.09)
  mid.addScaledVector(out, dist * 0.04)
  return new THREE.QuadraticBezierCurve3(a, mid, b)
}

export function createLineage(nodes, edges) {
  const rand = mulberry32(1865)
  const byId = new Map(nodes.map((s) => [s.id, s]))
  const validEdges = edges.filter((e) => byId.has(e.from) && byId.has(e.to))

  const vertCount = validEdges.length * SEGMENTS * 2
  const positions = new Float32Array(vertCount * 3)
  const colors = new Float32Array(vertCount * 3)
  const tAlong = new Float32Array(vertCount)
  const types = new Float32Array(vertCount)
  const phases = new Float32Array(vertCount)
  const lens = new Float32Array(vertCount)

  const colA = new THREE.Color()
  const colB = new THREE.Color()
  const mixed = new THREE.Color()

  const edgeMeta = []

  let v = 0
  validEdges.forEach((edge) => {
    edgeMeta.push({ from: edge.from, to: edge.to, start: v, count: SEGMENTS * 2 })
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    const a = new THREE.Vector3(...from.pos)
    const b = new THREE.Vector3(...to.pos)
    const curve = edgeCurve(a, b)
    const pts = curve.getPoints(SEGMENTS)
    const type = edge.type === 'inspiration' ? 1 : 0
    const phase = rand()
    const len = a.distanceTo(b)

    colA.set(BRANCHES[from.branch].color)
    colB.set(BRANCHES[to.branch].color)

    for (let i = 0; i < SEGMENTS; i += 1) {
      for (const [pt, t] of [
        [pts[i], i / SEGMENTS],
        [pts[i + 1], (i + 1) / SEGMENTS]
      ]) {
        positions[v * 3] = pt.x
        positions[v * 3 + 1] = pt.y
        positions[v * 3 + 2] = pt.z
        mixed.copy(colA).lerp(colB, t).lerp(new THREE.Color(1, 1, 1), 0.4)
        colors[v * 3] = mixed.r
        colors[v * 3 + 1] = mixed.g
        colors[v * 3 + 2] = mixed.b
        tAlong[v] = t
        types[v] = type
        phases[v] = phase
        lens[v] = len
        v += 1
      }
    }
  })

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  geo.setAttribute('aT', new THREE.BufferAttribute(tAlong, 1))
  geo.setAttribute('aType', new THREE.BufferAttribute(types, 1))
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
  geo.setAttribute('aLen', new THREE.BufferAttribute(lens, 1))

  const his = new Float32Array(vertCount)
  const hiAttr = new THREE.BufferAttribute(his, 1)
  geo.setAttribute('aHi', hiAttr)

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uFocus: { value: 0 }
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aT;
      attribute float aType;
      attribute float aPhase;
      attribute float aLen;
      attribute float aHi;
      varying vec3 vColor;
      varying float vT;
      varying float vType;
      varying float vPhase;
      varying float vLen;
      varying float vHi;

      void main() {
        vColor = aColor;
        vT = aT;
        vType = aType;
        vPhase = aPhase;
        vLen = aLen;
        vHi = aHi;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uReveal;
      uniform float uFocus;
      varying vec3 vColor;
      varying float vT;
      varying float vType;
      varying float vPhase;
      varying float vLen;
      varying float vHi;

      void main() {
        float tri = abs(fract(vT * vLen / 16.0) * 2.0 - 1.0);
        float dash = vType > 0.5 ? smoothstep(0.42, 0.58, tri) : 1.0;
        float base = vType > 0.5 ? 0.05 : 0.13;
        float flow = fract(vT - uTime * 0.07 - vPhase);
        float pulse = exp(-flow * 6.5) * 0.85;
        float alpha = (base + pulse) * dash * uReveal;
        vec3 col = mix(vColor, vec3(0.62, 0.66, 0.74), vType * 0.55);
        col *= 0.5 + pulse * 2.4;
        float focusMul = mix(1.0, mix(0.05, 3.4, vHi), uFocus);
        alpha *= focusMul;
        col = mix(col, vColor * 1.35, uFocus * vHi * 0.7);
        alpha = mix(alpha, min(alpha + 0.28 * vHi * dash, 1.0), uFocus);
        gl_FragColor = vec4(col * alpha, alpha);
      }
    `
  })

  const lines = new THREE.LineSegments(geo, material)
  lines.frustumCulled = false

  let focusTarget = 0
  let lastT = 0

  function setFocus(nodeId, idSet = null) {
    focusTarget = nodeId ? 1 : 0
    if (nodeId) {
      edgeMeta.forEach((m) => {
        const hi = idSet
          ? idSet.has(m.from) && idSet.has(m.to)
          : m.from === nodeId || m.to === nodeId
        his.fill(hi ? 1 : 0, m.start, m.start + m.count)
      })
      hiAttr.needsUpdate = true
    }
  }

  function setFocusIds(idSet) {
    focusTarget = idSet ? 1 : 0
    if (idSet) {
      edgeMeta.forEach((m) => {
        const hi = idSet.has(m.from) && idSet.has(m.to)
        his.fill(hi ? 1 : 0, m.start, m.start + m.count)
      })
      hiAttr.needsUpdate = true
    }
  }

  function update(t, reveal) {
    const dt = Math.min(t - lastT, 0.05)
    lastT = t
    material.uniforms.uTime.value = t
    const u = material.uniforms
    u.uFocus.value += (focusTarget - u.uFocus.value) * Math.min(1, dt * 7)
    u.uReveal.value = Math.max(reveal, u.uFocus.value)
  }

  return { object: lines, update, setFocus, setFocusIds }
}
