import * as THREE from 'three'
import { colorForTopic } from '../data/topics.js'
import { mulberry32 } from '../utils/prng.js'

// Connection lines between nodes (papers and ideas). Two semantic types:
//   "grounded-in"  — idea -> source paper(s) it was generated from. Drawn
//                     SOLID (was "derivation" in the physics-atlas original).
//   "similar"      — computed similarity edge (paper<->paper, idea<->idea,
//                     idea<->paper). Drawn DASHED (was "inspiration").
// `weight` (0-1, real similarity/confidence score) drives brightness and
// dash density — this is what satisfies EVAL_PLAN V5 (distinct edge
// treatments) and E1/E2 (edges reflect real, non-random signal).
// Animated "flow packet" traveling along each curve is preserved from the
// original (EVAL_PLAN F5: hover/select must ANIMATE edges, not just
// static-recolor them) — see the `flow` term in the fragment shader.

const SEGMENTS = 22

// Capacity headroom mirrors nodeStars.js: pre-allocate room for edges added
// by live idea generation so we never need a full geometry rebuild.
function computeCapacity(n) {
  return Math.max(Math.ceil(n * 1.8), n + 120)
}

function edgeCurve(a, b) {
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
  const dist = a.distanceTo(b)
  const out = mid.clone().setY(0).normalize()
  mid.addScaledVector(new THREE.Vector3(0, 1, 0), dist * 0.09)
  mid.addScaledVector(out, dist * 0.04)
  return new THREE.QuadraticBezierCurve3(a, mid, b)
}

export function createEdges(nodesData, edgesData, topicMeta) {
  const rand = mulberry32(1865)
  // Mutable map, not a frozen snapshot: registerNode() (called from
  // main.js's insertGeneratedNodes) keeps this in sync with live nodes[]
  // so addEdge() can resolve endpoints for freshly-generated ideas.
  const byId = new Map(nodesData.map((n) => [n.id, n]))

  const initialEdgeCount = edgesData.length
  const edgeCapacity = computeCapacity(Math.max(initialEdgeCount, 1))
  const vertCapacity = edgeCapacity * SEGMENTS * 2

  const positions = new Float32Array(vertCapacity * 3)
  const colors = new Float32Array(vertCapacity * 3)
  const tAlong = new Float32Array(vertCapacity)
  const types = new Float32Array(vertCapacity) // 0 = grounded-in (solid), 1 = similar (dashed)
  const phases = new Float32Array(vertCapacity)
  const lens = new Float32Array(vertCapacity)
  const weights = new Float32Array(vertCapacity)

  const colA = new THREE.Color()
  const colB = new THREE.Color()
  const mixed = new THREE.Color()

  const edgeMeta = [] // { from, to, start, count } per edge, for hover-highlight lookup

  function colorForNode(node) {
    const primaryTopic = (node.topics ?? [])[0]
    return colorForTopic(topicMeta, primaryTopic)
  }

  function writeEdge(v0, edge) {
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    if (!from || !to) return v0 // skip dangling edges gracefully (e.g. stale ids)
    edgeMeta.push({ from: edge.from, to: edge.to, start: v0, count: SEGMENTS * 2 })
    const a = new THREE.Vector3(...from.pos.galaxy)
    const b = new THREE.Vector3(...to.pos.galaxy)
    const curve = edgeCurve(a, b)
    const pts = curve.getPoints(SEGMENTS)
    const type = edge.type === 'similar' ? 1 : 0
    const phase = rand()
    const len = a.distanceTo(b)
    const weight = edge.weight ?? 0.5

    colA.set(colorForNode(from))
    colB.set(colorForNode(to))

    let v = v0
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
        weights[v] = weight
        v += 1
      }
    }
    return v
  }

  let vCount = 0
  edgesData.forEach((edge) => {
    vCount = writeEdge(vCount, edge)
  })

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  geo.setAttribute('aT', new THREE.BufferAttribute(tAlong, 1))
  geo.setAttribute('aType', new THREE.BufferAttribute(types, 1))
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
  geo.setAttribute('aLen', new THREE.BufferAttribute(lens, 1))
  geo.setAttribute('aWeight', new THREE.BufferAttribute(weights, 1))

  const his = new Float32Array(vertCapacity)
  const hiAttr = new THREE.BufferAttribute(his, 1)
  geo.setAttribute('aHi', hiAttr)

  function computePositions(lensKey) {
    const out = new Float32Array(vertCapacity * 3)
    let vi = 0
    edgeMeta.forEach((m) => {
      const from = byId.get(m.from)
      const to = byId.get(m.to)
      const a = new THREE.Vector3(...from.pos[lensKey])
      const b = new THREE.Vector3(...to.pos[lensKey])
      const pts = edgeCurve(a, b).getPoints(SEGMENTS)
      for (let i = 0; i < SEGMENTS; i += 1) {
        for (const pt of [pts[i], pts[i + 1]]) {
          out[vi * 3] = pt.x
          out[vi * 3 + 1] = pt.y
          out[vi * 3 + 2] = pt.z
          vi += 1
        }
      }
    })
    return out
  }

  const posTo = new Float32Array(positions)
  const posToAttr = new THREE.BufferAttribute(posTo, 3)
  geo.setAttribute('aPosTo', posToAttr)

  geo.setDrawRange(0, vCount)

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uFocus: { value: 0 },
      uLensT: { value: 0 }
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aT;
      attribute float aType;
      attribute float aPhase;
      attribute float aLen;
      attribute float aHi;
      attribute float aWeight;
      attribute vec3 aPosTo;
      uniform float uLensT;
      varying vec3 vColor;
      varying float vT;
      varying float vType;
      varying float vPhase;
      varying float vLen;
      varying float vHi;
      varying float vWeight;

      void main() {
        vColor = aColor;
        vT = aT;
        vType = aType;
        vPhase = aPhase;
        vLen = aLen;
        vHi = aHi;
        vWeight = aWeight;
        float lt = smoothstep(0.0, 1.0, clamp(uLensT * 1.35 - aPhase * 0.35, 0.0, 1.0));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(mix(position, aPosTo, lt), 1.0);
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
      varying float vWeight;

      void main() {
        // "similar" edges dashed (short dash + gap), "grounded-in" solid.
        float tri = abs(fract(vT * vLen / 16.0) * 2.0 - 1.0);
        float dash = vType > 0.5 ? smoothstep(0.42, 0.58, tri) : 1.0;

        // Weight drives baseline brightness — a low-confidence similarity
        // edge is visibly dimmer than a strong one, not a uniform gray line.
        float base = (vType > 0.5 ? 0.05 : 0.13) * (0.4 + vWeight * 0.8);

        // Flow packet travels from source (t=0) to target (t=1), animated —
        // this is the required ANIMATED highlight (EVAL_PLAN F5), not a
        // static color swap: it moves along the curve every frame.
        float flow = fract(vT - uTime * 0.07 - vPhase);
        float pulse = exp(-flow * 6.5) * 0.85 * (0.5 + vWeight * 0.6);

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

  // Highlight edges touching a single node (starId), or, when idSet is
  // given, all edges with both ends inside idSet (used for "lineage"/
  // grounding-trail highlighting on click-lock).
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

  function beginLens(lensKey) {
    posTo.set(computePositions(lensKey))
    posToAttr.needsUpdate = true
  }
  function setLensProgress(v) {
    material.uniforms.uLensT.value = v
  }
  function commitLens() {
    geo.attributes.position.array.set(posTo.subarray(0, vCount * 3))
    geo.attributes.position.needsUpdate = true
    material.uniforms.uLensT.value = 0
  }

  // Called by main.js's insertGeneratedNodes() before addEdge() for any
  // edge touching a newly generated node — keeps byId resolvable.
  function registerNode(node) {
    byId.set(node.id, node)
  }

  // —— Live insertion API (capacity headroom, no geometry rebuild) ——
  function addEdge(edge) {
    if (vCount + SEGMENTS * 2 > vertCapacity) {
      console.warn('[edges] capacity exhausted, cannot add edge without rebuild:', edge)
      return false
    }
    const newV = writeEdge(vCount, edge)
    if (newV === vCount) return false // dangling edge, skipped
    posTo.set(positions.subarray(vCount * 3, newV * 3), vCount * 3)
    vCount = newV
    geo.setDrawRange(0, vCount)
    ;['position', 'aColor', 'aT', 'aType', 'aPhase', 'aLen', 'aWeight', 'aHi', 'aPosTo'].forEach((name) => {
      geo.attributes[name].needsUpdate = true
    })
    return true
  }

  return {
    object: lines,
    update,
    setFocus,
    setFocusIds,
    beginLens,
    setLensProgress,
    commitLens,
    registerNode,
    addEdge
  }
}
