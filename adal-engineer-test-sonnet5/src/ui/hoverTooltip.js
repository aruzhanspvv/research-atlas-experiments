// Lightweight semi-transparent hover tooltip — separate from the full
// click-to-open detail card (nodeCard.js). Satisfies the explicit user
// requirement "Hover over a node → semi-transparent info panel with
// details" and EVAL_PLAN F4 (hover must show type-correct fields
// immediately, not require a click). Follows the mouse, fades in/out,
// never intercepts pointer events (so it doesn't fight node picking).
export function createHoverTooltip() {
  const el = document.createElement('div')
  el.id = 'hoverTooltip'
  el.innerHTML = `
    <div class="tooltip-meta"><i class="tooltip-dot"></i><span class="tooltip-type"></span></div>
    <div class="tooltip-title"></div>
    <div class="tooltip-sub"></div>
    <div class="tooltip-novelty" style="display:none">
      <div class="tooltip-novelty-bar"><div class="tooltip-novelty-fill"></div></div>
      <span class="tooltip-novelty-label"></span>
    </div>`
  document.body.appendChild(el)

  let currentId = null

  function show(node, screenX, screenY) {
    if (node.id !== currentId) {
      currentId = node.id
      const isIdea = node.type === 'idea'
      el.querySelector('.tooltip-dot').style.background = isIdea ? '#a878ff' : '#8fa0c8'
      el.querySelector('.tooltip-type').textContent = isIdea
        ? `IDEA · ${(node.generationMethod ?? 'generated').toUpperCase()}`
        : `PAPER · ${(node.source ?? '').toUpperCase()}`
      el.querySelector('.tooltip-title').textContent = node.title
      el.querySelector('.tooltip-sub').textContent = isIdea
        ? (node.summary || '').slice(0, 140)
        : `${(node.authors ?? []).slice(0, 2).join(', ')}${(node.authors ?? []).length > 2 ? ' et al.' : ''} · ${node.year ?? ''}`

      const noveltyRow = el.querySelector('.tooltip-novelty')
      if (isIdea) {
        noveltyRow.style.display = ''
        const pct = Math.round((node.noveltyScore ?? 0) * 100)
        el.querySelector('.tooltip-novelty-fill').style.width = `${pct}%`
        el.querySelector('.tooltip-novelty-label').textContent = `Novelty ${pct}`
      } else {
        noveltyRow.style.display = 'none'
      }
    }
    // Position: offset from cursor, clamped to viewport so it never clips off-screen.
    const w = 260
    const h = el.offsetHeight || 90
    const x = Math.min(screenX + 18, window.innerWidth - w - 12)
    const y = Math.min(screenY + 18, window.innerHeight - h - 12)
    el.style.transform = `translate(${x}px, ${y}px)`
    el.classList.add('visible')
  }

  function hide() {
    currentId = null
    el.classList.remove('visible')
  }

  return { show, hide }
}
