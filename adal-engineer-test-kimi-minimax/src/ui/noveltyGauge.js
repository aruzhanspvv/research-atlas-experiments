// SVG radial gauge for the novelty score.
// Lives in the DOM (not canvas) so it stays crisp at any zoom and inherits the
// deepfield palette without shader work. Uses additive-style gradients via opacity
// stops to feel "in deepfield" without introducing candy hues.

const DEEPFIELD_BG = '#0a0e1c'
const DEEPFIELD_GLASS = 'rgba(10, 14, 28, 0.55)'

export function createNoveltyGauge(score, breakdown = null) {
  const root = document.createElement('div')
  root.className = 'novelty-gauge'
  const safeScore = Math.min(100, Math.max(0, Math.round(score)))

  const R = 38
  const C = 2 * Math.PI * R
  // Start at top (rotate -90°)
  const dashOffset = C * (1 - safeScore / 100)

  // Hue: 0..100 novelty → deepfield ring sweep (cool blue → soft gold → vivid at high)
  // Stay strictly inside the deepfield palette: cool blue / teal / soft gold / no candy.
  const hue = pickHue(safeScore)

  root.innerHTML = `
    <svg viewBox="0 0 100 100" width="96" height="96" aria-hidden="true">
      <defs>
        <linearGradient id="ng-${safeScore}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"  stop-color="${hue.start}" stop-opacity="0.85"/>
          <stop offset="100%" stop-color="${hue.end}"   stop-opacity="0.95"/>
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="${R}" fill="none" stroke="rgba(160,180,255,0.18)" stroke-width="6"/>
      <g transform="rotate(-90 50 50)">
        <circle cx="50" cy="50" r="${R}" fill="none" stroke="url(#ng-${safeScore})" stroke-width="6"
                stroke-linecap="round"
                stroke-dasharray="${C.toFixed(2)}"
                stroke-dashoffset="${dashOffset.toFixed(2)}"/>
      </g>
      <text x="50" y="48" text-anchor="middle" dominant-baseline="middle"
            font-family="SF Mono, Menlo, monospace" font-size="22" font-weight="500"
            fill="rgba(220, 230, 255, 0.96)">${safeScore}</text>
      <text x="50" y="68" text-anchor="middle" dominant-baseline="middle"
            font-family="Avenir Next, Helvetica Neue, sans-serif" font-size="8" letter-spacing="2"
            fill="rgba(160, 180, 220, 0.65)">/ 100</text>
    </svg>
  `
  return root
}

function pickHue(score) {
  // Three deepfield-safe gradients by score band.
  if (score >= 75) return { start: '#7be0d8', end: '#e9c97a' }    // teal → muted gold
  if (score >= 45) return { start: '#5db4ff', end: '#7be0d8' }    // cool blue → teal
  return                { start: '#7e8dff', end: '#5db4ff' }          // violet → cool blue
}

// Compact bar version for the Ideate panel row (no SVG, just a horizontal meter).
export function createNoveltyBar(score) {
  const root = document.createElement('div')
  root.className = 'novelty-bar'
  const safe = Math.min(100, Math.max(0, Math.round(score)))
  const hue = pickHue(safe)
  root.innerHTML = `
    <div class="novelty-bar-track">
      <div class="novelty-bar-fill" style="width:${safe}%; background:linear-gradient(90deg, ${hue.start}, ${hue.end});"></div>
    </div>
    <div class="novelty-bar-label">${safe}</div>
  `
  return root
}

// Render a small breakdown (distance / coverage / opportunity / paradigm) as a list.
export function createBreakdownList(parts) {
  if (!parts) return document.createElement('div')
  const root = document.createElement('div')
  root.className = 'novelty-breakdown'
  const items = [
    ['Distance',    parts.distance,    'Mean Jaccard distance to grounding papers'],
    ['Evidence',    parts.coverage,    `Evidence coverage (${parts.evidenceCount ?? 0} quotes)`],
    ['Opportunity', parts.opportunity, 'Opportunity-pattern weight (gap > bridge)'],
    ['Paradigm',    parts.paradigm,    'Research-paradigm weight (novel-mechanism > synthesis)']
  ]
  root.innerHTML = items.map(([label, val, hint]) => `
    <div class="breakdown-row">
      <div class="breakdown-label">${label}</div>
      <div class="breakdown-track"><div class="breakdown-fill" style="width:${(val * 100).toFixed(0)}%;"></div></div>
      <div class="breakdown-val">${(val * 100).toFixed(0)}</div>
      <div class="breakdown-hint">${hint}</div>
    </div>
  `).join('')
  return root
}
