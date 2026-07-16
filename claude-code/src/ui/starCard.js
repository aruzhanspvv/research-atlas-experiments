import { BRANCHES } from '../data/branches.js'
import { branchName, t } from '../i18n.js'

// Detail panel: click a star -> semi-transparent glass card with either a
// paper's metadata/abstract or a generated idea's hypothesis + novelty gauge.
// Back face lists the evidence graph: which papers ground this idea, or which
// ideas were grounded on this paper.

function noveltyColor(score) {
  // green (grounded/plausible) -> gold (notable) -> magenta (frontier-bold)
  if (score < 40) return '#7cff6b'
  if (score < 70) return '#ffd27a'
  return '#ff6ad5'
}

function drawNoveltyGauge(canvas, score) {
  const dpr = window.devicePixelRatio || 1
  const size = 96
  canvas.width = size * dpr
  canvas.height = size * dpr
  canvas.style.width = `${size}px`
  canvas.style.height = `${size}px`
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, size, size)
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 8
  const start = -Math.PI / 2
  const end = start + (Math.PI * 2 * score) / 100
  const color = noveltyColor(score)

  ctx.lineWidth = 7
  ctx.strokeStyle = 'rgba(160, 185, 255, 0.14)'
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.shadowColor = color
  ctx.shadowBlur = 14
  ctx.beginPath()
  ctx.arc(cx, cy, r, start, end)
  ctx.stroke()
  ctx.shadowBlur = 0

  ctx.fillStyle = 'rgba(235, 240, 255, 0.95)'
  ctx.font = '600 22px "Avenir Next", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(score), cx, cy - 2)
  ctx.fillStyle = 'rgba(235, 240, 255, 0.45)'
  ctx.font = '10px "Avenir Next", sans-serif'
  ctx.fillText('NOVELTY', cx, cy + 16)
}

export function createStarCard({ starById }) {
  const root = document.createElement('div')
  root.id = 'starCard'
  root.innerHTML = `
    <div class="card-inner">
      <section class="card-face card-front">
        <button class="card-close" aria-label="Close">×</button>
        <div class="card-meta"><i class="card-dot"></i><span class="card-branch"></span><span class="card-tag"></span></div>
        <h2 class="card-title"></h2>
        <div class="card-author"></div>
        <div class="card-novelty-wrap"><canvas class="card-novelty-gauge"></canvas></div>
        <p class="card-oneliner"></p>
        <div class="card-sec card-gap-sec"><h4>${t('card.gap')}</h4><p class="card-gap"></p></div>
        <div class="card-sec card-method-sec"><h4>${t('card.method')}</h4><p class="card-method"></p></div>
        <a class="card-link" target="_blank" rel="noopener"></a>
        <button class="card-flip card-flip-back"></button>
      </section>
      <section class="card-face card-back">
        <button class="card-close" aria-label="Close">×</button>
        <h3 class="card-back-title"></h3>
        <div class="card-lineage">
          <div class="card-sec"><h4 class="card-grounded-title"></h4><ul class="card-grounded"></ul></div>
          <div class="card-sec card-diff-sec"><h4></h4><p class="card-diff"></p></div>
          <div class="card-sec card-priorart-sec"><h4></h4><p class="card-priorart"></p></div>
        </div>
        <button class="card-flip card-flip-front"></button>
      </section>
    </div>`
  document.body.appendChild(root)

  const q = (sel) => root.querySelector(sel)
  let onCloseCb = null
  let onNavigateCb = null
  let currentStar = null

  q('.card-flip-back').textContent = 'Evidence graph ⟶'
  q('.card-flip-front').textContent = '⟵ Front'

  function fillList(sel, ids, emptyKey = 'empty') {
    const ul = q(sel)
    ul.textContent = ''
    if (!ids?.length) {
      const li = document.createElement('li')
      li.textContent = t(`card.${emptyKey}`)
      ul.appendChild(li)
      return
    }
    ids.forEach((id) => {
      const target = starById.get(id)
      const li = document.createElement('li')
      li.textContent = target ? target.title : id
      if (target) {
        li.classList.add('is-link')
        li.addEventListener('click', () => onNavigateCb?.(target))
      }
      ul.appendChild(li)
    })
  }

  function renderStar(star) {
    const branch = BRANCHES[star.branch]
    const isIdea = star.type === 'idea'
    root.classList.toggle('is-idea', isIdea)
    q('.card-dot').style.background = branch.color
    q('.card-branch').textContent = branchName(star.branch, BRANCHES)
    q('.card-tag').textContent = isIdea ? t('card.ideaTag') : t('card.paperTag')
    q('.card-title').textContent = star.title
    q('.card-author').textContent = isIdea
      ? `generated · ${star.year}`
      : `${(star.authors ?? []).slice(0, 3).join(', ')}${(star.authors ?? []).length > 3 ? ' et al.' : ''} · ${star.year} · ${star.venue}`
    q('.card-oneliner').textContent = star.oneLiner ?? ''
    q('.card-back-title').textContent = star.title

    const gaugeWrap = q('.card-novelty-wrap')
    if (isIdea) {
      gaugeWrap.style.display = ''
      drawNoveltyGauge(q('.card-novelty-gauge'), star.noveltyScore)
    } else {
      gaugeWrap.style.display = 'none'
    }

    q('.card-gap-sec').style.display = isIdea ? '' : 'none'
    q('.card-method-sec').style.display = isIdea ? '' : 'none'
    if (isIdea) {
      q('.card-gap').textContent = star.gap ?? ''
      q('.card-method').textContent = star.method ?? ''
    }

    const link = q('.card-link')
    if (!isIdea && star.url) {
      link.style.display = ''
      link.href = star.url
      link.textContent = t('card.readPaper')
    } else {
      link.style.display = 'none'
    }

    q('.card-grounded-title').textContent = isIdea ? t('card.groundedIn') : t('card.relatedIdeas')
    fillList('.card-grounded', isIdea ? star.groundedIn : star.relatedIdeas)

    const diffSec = q('.card-diff-sec')
    const priorSec = q('.card-priorart-sec')
    diffSec.style.display = isIdea ? '' : 'none'
    priorSec.style.display = isIdea ? '' : 'none'
    if (isIdea) {
      diffSec.querySelector('h4').textContent = t('card.differentiation')
      q('.card-diff').textContent = star.differentiation ?? ''
      priorSec.querySelector('h4').textContent = t('card.priorArt')
      q('.card-priorart').textContent = star.priorArt ?? ''
    }
  }

  function open(star) {
    currentStar = star
    root.classList.remove('flipped')
    renderStar(star)
    root.classList.add('open')
  }

  function close(reason = 'program') {
    if (!root.classList.contains('open')) return
    root.classList.remove('open')
    onCloseCb?.(reason)
  }

  root.querySelectorAll('.card-close').forEach((b) => b.addEventListener('click', () => close('dismiss')))
  root.querySelectorAll('.card-flip').forEach((b) => b.addEventListener('click', () => root.classList.toggle('flipped')))
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close('dismiss')
  })

  return {
    open,
    close,
    onClose(cb) {
      onCloseCb = cb
    },
    onNavigate(cb) {
      onNavigateCb = cb
    },
    get isOpen() {
      return root.classList.contains('open')
    },
    get current() {
      return currentStar
    }
  }
}
