import * as THREE from 'three'
import { BRANCHES } from '../data/branches.js'
import { mulberry32 } from '../utils/prng.js'

// 传承光丝：实线 = 直接推导（derivation），虚线 = 启发（inspiration）。
// 第三种 type="grounding"（新增）：低饱和暖青光丝，从源文献流向生成的 idea，
// 视觉上比 inspiration 更慢、更冷，告诉读者"这条线指向的是 AI 想法"。
// 光包沿线从"肩膀"流向"站上来的人"，方向即影响传递的方向。
// 中景才浮现（uReveal 由相机距离驱动），远景让位给星云。

const MAX_EDGES = 8192
const SEGMENTS = 22

function edgeCurve(a, b) {
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
  const dist = a.distanceTo(b)
  // 拱起方向：向上 + 微微向星系外，让线离开盘面呈弧
  const out = mid.clone().setY(0).normalize()
  mid.addScaledVector(new THREE.Vector3(0, 1, 0), dist * 0.09)
  mid.addScaledVector(out, dist * 0.04)
  return new THREE.QuadraticBezierCurve3(a, mid, b)
}

export function createLineage(initialStars, initialEdges) {
  const rand = mulberry32(1865)
  const starsById = new Map(initialStars.map((s) => [s.id, s]))

  const vertCount = MAX_EDGES * SEGMENTS * 2
  const positions = new Float32Array(vertCount * 3)
  const colors = new Float32Array(vertCount * 3)
  const tAlong = new Float32Array(vertCount)
  const types = new Float32Array(vertCount)            // 0 = derivation, 1 = inspiration, 2 = grounding
  const phases = new Float32Array(vertCount)
  const lens = new Float32Array(vertCount)

  // Per-edge meta: { from, to, start (vertex index), count, key }
  const edgeMeta = []
  const edgeKeyToIndex = new Map()                     // for dedupe on addEdge

  const colA = new THREE.Color()
  const colB = new THREE.Color()
  const mixed = new THREE.Color()
  const GROUNDING_HUE = new THREE.Color(0.42, 0.74, 0.85)  // cool deepfield teal

  let v = 0
  initialEdges.forEach((edge) => {
    appendEdge(edge)
  })

  function appendEdge(edge) {
    const fromStar = starsById.get(edge.from)
    const toStar = starsById.get(edge.to)
    if (!fromStar || !toStar) return -1
    const key = `${edge.from}->${edge.to}`
    if (edgeKeyToIndex.has(key)) return edgeKeyToIndex.get(key)

    if (edgeMeta.length >= MAX_EDGES) return -1
    const idx = edgeMeta.length
    const start = v
    const a = new THREE.Vector3(...fromStar.pos.galaxy)
    const b = new THREE.Vector3(...toStar.pos.galaxy)
    const curve = edgeCurve(a, b)
    const pts = curve.getPoints(SEGMENTS)
    const typeVal = edge.type === 'inspiration' ? 1 : edge.type === 'grounding' ? 2 : 0
    const phase = rand()
    const len = a.distanceTo(b)

    colA.set(BRANCHES[fromStar.branch]?.color ?? '#ffffff')
    colB.set(BRANCHES[toStar.branch]?.color ?? '#ffffff')

    for (let i = 0; i < SEGMENTS; i += 1) {
      for (const [pt, t] of [
        [pts[i], i / SEGMENTS],
        [pts[i + 1], (i + 1) / SEGMENTS]
      ]) {
        positions[v * 3] = pt.x
        positions[v * 3 + 1] = pt.y
        positions[v * 3 + 2] = pt.z
        if (typeVal === 2) {
          // Grounding edges: lerp toward a cool teal hue so the type reads at a glance.
          mixed.copy(colA).lerp(colB, t).lerp(GROUNDING_HUE, 0.55)
        } else {
          mixed.copy(colA).lerp(colB, t).lerp(new THREE.Color(1, 1, 1), 0.4)
        }
        colors[v * 3] = mixed.r
        colors[v * 3 + 1] = mixed.g
        colors[v * 3 + 2] = mixed.b
        tAlong[v] = t
        types[v] = typeVal
        phases[v] = phase
        lens[v] = len
        v += 1
      }
    }
    edgeMeta.push({ from: edge.from, to: edge.to, start, count: SEGMENTS * 2, key })
    edgeKeyToIndex.set(key, idx)
    return idx
  }

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

  // 透镜切换：按目标布局重算全部弧线顶点
  function computePositions(lensKey) {
    const out = new Float32Array(vertCount * 3)
    let vi = 0
    edgeMeta.forEach((m) => {
      const fromStar = starsById.get(m.from)
      const toStar = starsById.get(m.to)
      if (!fromStar || !toStar) {
        vi += m.count
        return
      }
      const a = new THREE.Vector3(...fromStar.pos[lensKey])
      const b = new THREE.Vector3(...toStar.pos[lensKey])
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
      attribute vec3 aPosTo;
      uniform float uLensT;
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

      void main() {
        // dash pattern: derivation = solid, inspiration = dashed, grounding = slow dashed
        float tri = abs(fract(vT * vLen / 16.0) * 2.0 - 1.0);
        float dash;
        float base;
        if (vType > 1.5) {
          // grounding: long-dash, low-saturation
          dash = smoothstep(0.3, 0.6, tri);
          base = 0.06;
        } else if (vType > 0.5) {
          // inspiration
          dash = smoothstep(0.42, 0.58, tri);
          base = 0.05;
        } else {
          dash = 1.0;
          base = 0.13;
        }
        // flow speed: grounding moves slowest
        float flowSpeed = vType > 1.5 ? 0.04 : (vType > 0.5 ? 0.07 : 0.07);
        float flow = fract(vT - uTime * flowSpeed - vPhase);
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
  lines.renderOrder = 2

  let focusTarget = 0
  let lastT = 0

  function setFocus(starId, idSet = null) {
    focusTarget = starId ? 1 : 0
    if (starId) {
      edgeMeta.forEach((m) => {
        const hi = idSet
          ? idSet.has(m.from) && idSet.has(m.to)
          : m.from === starId || m.to === starId
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
    geo.attributes.position.array.set(posTo)
    geo.attributes.position.needsUpdate = true
    material.uniforms.uLensT.value = 0
  }

  // —— Live insertion API ——
  // Registers a new star (if `from` or `to` is not yet known) and appends an edge.
  // `starsRegistry` is a Map<id, star> maintained by main.js.
  function registerStar(star) {
    if (!starsById.has(star.id)) starsById.set(star.id, star)
  }
  function addEdge(edge) {
    const idx = appendEdge(edge)
    if (idx < 0) return -1
    geo.attributes.position.needsUpdate = true
    geo.attributes.aColor.needsUpdate = true
    geo.attributes.aT.needsUpdate = true
    geo.attributes.aType.needsUpdate = true
    geo.attributes.aPhase.needsUpdate = true
    geo.attributes.aLen.needsUpdate = true
    // Reposition new edge into current layout if we are mid-lens.
    if (material.uniforms.uLensT.value > 0.001) {
      posTo.set(computePositions('galaxy'))
      posToAttr.needsUpdate = true
    }
    return idx
  }
  function getEdgeMeta() { return edgeMeta }

  return {
    object: lines,
    update,
    setFocus,
    setFocusIds,
    beginLens,
    setLensProgress,
    commitLens,
    registerStar,
    addEdge,
    getEdgeMeta,
    get count() { return edgeMeta.length },
    get capacity() { return MAX_EDGES }
  }
}
