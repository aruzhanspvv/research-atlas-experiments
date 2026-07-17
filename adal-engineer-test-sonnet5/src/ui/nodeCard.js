// Detail panel — shown on node click (flies camera in + opens card).
// Branches content by node.type so paper metadata and idea content are
// NEVER mixed/mistemplated (EVAL_PLAN F4). Shares the flip-card shell
// (glass panel, blur, close button, flip button) from the original
// physics-atlas starCard.js, but front/back content is fully re-authored.
//
// Idea cards render a radial novelty gauge (canvas-drawn arc, animated
// color gradient) + explanatory rationale text — this is the PANEL-level
// reinforcement of the novelty signal; the PRIMARY signal is the pulsing
// 3D aura in nodeStars.js (EVAL_PLAN N2/N3).

function drawNoveltyGauge(canvas, score) {
  const ctx = canvas.getContext('2d')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const size = 96
  canvas.width = size * dpr
  canvas.height = size * dpr
  canvas.style.width = `${size}px`
  canvas.style.height = `${size}px`
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, size, size)

  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 8
  const startAngle = -Math.PI / 2
  const endAngle = startAngle + Math.PI * 2 * score

  // Track (full circle, dim)
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(150, 175, 255, 0.14)'
  ctx.lineWidth = 7
  ctx.stroke()

  // Score arc — gradient matches the 3D aura color axis (violet -> cyan)
  const grad = ctx.createLinearGradient(0, 0, size, size)
  grad.addColorStop(0, 'rgba(160, 100, 255, 0.95)')
  grad.addColorStop(1, 'rgba(120, 230, 255, 0.95)')
  ctx.beginPath()
  ctx.arc(cx, cy, r, startAngle, endAngle)
  ctx.strokeStyle = grad
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  ctx.shadowColor = 'rgba(140, 200, 255, 0.6)'
  ctx.shadowBlur = 10
  ctx.stroke()
  ctx.shadowBlur = 0

  // Center label
  ctx.fillStyle = 'rgba(235, 240, 255, 0.95)'
  ctx.font = '600 20px "Avenir Next", "Helvetica Neue", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(Math.round(score * 100).toString(), cx, cy - 4)
  ctx.font = '400 8px "Avenir Next", "Helvetica Neue", sans-serif'
  ctx.fillStyle = 'rgba(200, 215, 255, 0.6)'
  ctx.fillText('NOVELTY', cx, cy + 13)
}

export function createNodeCard() {
  const root = document.createElement('div')
  root.id = 'nodeCard'
  root.innerHTML = `
    <div class="card-inner">
      <section class="card-face card-front">
        <button class="card-close" aria-label="Close">×</button>
        <div class="card-meta"><i class="card-dot"></i><span class="card-type"></span><span class="card-year"></span></div>
        <h2 class="card-title"></h2>
        <div class="card-sub"></div>
        <div class="card-novelty-row" style="display:none">
          <canvas class="card-novelty-gauge"></canvas>
          <div class="card-novelty-tags"></div>
        </div>
        <p class="card-body"></p>
        <div class="card-chips"></div>
        <a class="card-link" target="_blank" rel="noopener"></a>
        <button class="card-flip card-flip-back"></button>
      </section>
      <section class="card-face card-back">
        <button class="card-close" aria-label="Close">×</button>
        <h3 class="card-back-title"></h3>
        <div class="card-lineage">
          <div class="card-sec"><h4 class="card-grounded-title"></h4><ul class="card-grounded"></ul></div>
          <div class="card-sec"><h4 class="card-similar-title"></h4><ul class="card-similar"></ul></div>
          <div class="card-sec card-rationale-sec" style="display:none"><h4>WHY THIS SCORE</h4><p class="card-rationale"></p></div>
          <div class="card-sec card-diff-sec" style="display:none"><h4>DIFFERENTIATION</h4><p class="card-diff"></p></div>
        </div>
        <button class="card-flip card-flip-front"></button>
      </section>
    </div>`
  document.body.appendChild(root)

  const q = (sel) => root.querySelector(sel)
  let onCloseCb = null
  let getNodeById = null // injected by main.js so we can render generatedFrom/similar titles

  function fillList(sel, ids) {
    const ul = q(sel)
    ul.textContent = ''
    ;(ids ?? []).forEach((id) => {
      const li = document.createElement('li')
      const node = getNodeById?.(id)
      li.textContent = node ? node.title : id
      ul.appendChild(li)
    })
  }

  function renderPaper(node, related) {
    q('.card-dot').style.background = '#8fa0c8'
    q('.card-type').textContent = `PAPER · ${(node.source ?? 'unknown').toUpperCase()}`
    q('.card-year').textContent = node.year ? `· ${node.year}` : ''
    q('.card-title').textContent = node.title
    q('.card-sub').textContent = (node.authors ?? []).slice(0, 4).join(', ') + ((node.authors ?? []).length > 4 ? ' et al.' : '')
    q('.card-novelty-row').style.display = 'none'
    q('.card-body').textContent = node.abstract || 'No abstract available.'
    const chips = q('.card-chips')
    chips.textContent = ''
    ;(node.topics ?? []).forEach((tag) => {
      const c = document.createElement('span')
      c.className = 'chip'
      c.textContent = tag
      chips.appendChild(c)
    })
    const link = q('.card-link')
    if (node.sourceUrl) {
      link.href = node.sourceUrl
      link.textContent = 'View source ↗'
      link.style.display = ''
    } else {
      link.style.display = 'none'
    }

    q('.card-back-title').textContent = node.title
    q('.card-grounded-title').textContent = 'IDEAS GROUNDED IN THIS PAPER'
    q('.card-similar-title').textContent = 'SIMILAR PAPERS'
    fillList('.card-grounded', related.groundedByThis)
    fillList('.card-similar', related.similar)
    q('.card-rationale-sec').style.display = 'none'
    q('.card-diff-sec').style.display = 'none'
  }

  function renderIdea(node, related) {
    q('.card-dot').style.background = '#a878ff'
    q('.card-type').textContent = `IDEA · ${(node.generationMethod ?? 'generated').toUpperCase()}`
    q('.card-year').textContent = node.createdAt ? `· ${new Date(node.createdAt).toLocaleDateString()}` : ''
    q('.card-title').textContent = node.title
    q('.card-sub').textContent = node.summary || ''

    q('.card-novelty-row').style.display = 'flex'
    drawNoveltyGauge(q('.card-novelty-gauge'), node.noveltyScore ?? 0)
    const tagsEl = q('.card-novelty-tags')
    tagsEl.innerHTML = ''
    ;[node.opportunityPattern, node.researchParadigm].filter(Boolean).forEach((tag) => {
      const c = document.createElement('span')
      c.className = 'chip chip-idea'
      c.textContent = tag
      tagsEl.appendChild(c)
    })

    q('.card-body').textContent = node.fullText || node.summary || ''
    q('.card-chips').textContent = ''
    q('.card-link').style.display = 'none'

    q('.card-back-title').textContent = node.title
    q('.card-grounded-title').textContent = 'GROUNDED IN'
    q('.card-similar-title').textContent = 'RELATED IDEAS/PAPERS'
    fillList('.card-grounded', node.generatedFrom)
    fillList('.card-similar', related.similar)

    // N3: explanatory context for the novelty score, always visible on the
    // back face (click-through, not hidden behind a secondary hover).
    q('.card-rationale-sec').style.display = node.noveltyRationale ? '' : 'none'
    q('.card-rationale').textContent = node.noveltyRationale || ''
    q('.card-diff-sec').style.display = node.differentiation ? '' : 'none'
    q('.card-diff').textContent = node.differentiation || ''
  }

  // Bug #2 fix: browsers can leave a CSS transition in a stuck state
  // (playState: "running" but a frozen currentTime, opacity stalled at an
  // intermediate value like 0.245) after rapid toggling or a backgrounded/
  // throttled tab — confirmed via EVAL_REPORT.md's getAnimations() evidence
  // on repeated open/close of this exact panel. classList state was always
  // correct (open() sets .open, close() removes it), but a STALE, still-
  // running animation from a previous transition can visually override the
  // element's actual target style indefinitely, with no in-app recovery.
  //
  // Fix: before starting a NEW open/close transition, explicitly cancel any
  // in-flight animations on this element (and its flip-inner child) so the
  // browser can never layer a fresh transition on top of a stuck one. This
  // is a synchronous, deterministic guarantee — not a timer that can desync
  // from actual DOM state.
  function settleAnimations() {
    root.getAnimations({ subtree: true }).forEach((anim) => anim.cancel())
  }

  // Bug #3 fix: the front and back faces both keep a "Close" button in the
  // DOM at all times (the flip is a pure CSS 3D transform, backface-hidden
  // visually but still focusable/reachable by keyboard nav, screen readers,
  // and automation tooling — confirmed via EVAL_REPORT.md's ambiguous
  // duplicate-"Close"-button finding). Apply `inert` to whichever face is
  // currently rotated away from the viewer (or the whole card when fully
  // closed) so only ONE interactive Close is ever reachable at a time.
  const frontFace = q('.card-front')
  const backFace = q('.card-back')
  function syncFaceInertness() {
    const isOpen = root.classList.contains('open')
    const flipped = root.classList.contains('flipped')
    frontFace.inert = !isOpen || flipped
    backFace.inert = !isOpen || !flipped
    frontFace.setAttribute('aria-hidden', String(!isOpen || flipped))
    backFace.setAttribute('aria-hidden', String(!isOpen || !flipped))
  }
  syncFaceInertness()

  function open(node, related = {}) {
    settleAnimations()
    root.classList.remove('flipped')
    if (node.type === 'idea') renderIdea(node, related)
    else renderPaper(node, related)
    root.classList.add('open')
    syncFaceInertness()
  }

  function close(reason = 'program') {
    if (!root.classList.contains('open')) return
    settleAnimations()
    root.classList.remove('open')
    syncFaceInertness()
    onCloseCb?.(reason)
  }

  root.querySelectorAll('.card-close').forEach((b) => b.addEventListener('click', () => close('dismiss')))
  root.querySelectorAll('.card-flip').forEach((b) =>
    b.addEventListener('click', () => {
      root.classList.toggle('flipped')
      syncFaceInertness()
    })
  )
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close('dismiss')
  })

  return {
    open,
    close,
    onClose(cb) {
      onCloseCb = cb
    },
    setNodeLookup(fn) {
      getNodeById = fn
    },
    get isOpen() {
      return root.classList.contains('open')
    }
  }
}
