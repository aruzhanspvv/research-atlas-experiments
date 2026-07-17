import katex from 'katex'
import 'katex/dist/katex.min.css'
import { BRANCHES } from '../data/branches.js'
import {
  branchName,
  getLanguage,
  onLanguageChange,
  starAuthor,
  starName,
  starOneLiner,
  t
} from '../i18n.js'

// Paper-card: the click-through detail panel for an arXiv-derived paper.
// Renders the new optional paper fields (abstract, authors, venue, sourceUrl).
// Distinct from ideaCard.js, which renders AI-generated ideas.

export function createStarCard() {
  const root = document.createElement('div')
  root.id = 'starCard'
  root.innerHTML = `
    <div class="card-inner">
      <section class="card-face card-front">
        <button class="card-close" aria-label="Close">×</button>
        <div class="card-meta"><i class="card-dot"></i><span class="card-branch"></span><span class="card-year"></span></div>
        <h2 class="card-title"></h2>
        <div class="card-author"></div>
        <div class="card-eq"></div>
        <p class="card-oneliner"></p>
        <div class="card-abstract"></div>
        <ul class="card-links"></ul>
        <button class="card-flip card-flip-back">${t('card.flipBack')}</button>
      </section>
      <section class="card-face card-back">
        <button class="card-close" aria-label="Close">×</button>
        <h3 class="card-back-title"></h3>
        <div class="card-lineage">
          <div class="card-sec"><h4 class="card-supersedes-title">${t('card.supersedes')}</h4><ul class="card-supersedes"></ul></div>
          <div class="card-sec"><h4 class="card-supersededBy-title">${t('card.supersededBy')}</h4><ul class="card-supersededBy"></ul></div>
          <div class="card-sec"><h4 class="card-leadsTo-title">${t('card.leadsTo')}</h4><ul class="card-leadsTo"></ul></div>
        </div>
        <button class="card-flip card-flip-front">${t('card.flipFront')}</button>
      </section>
    </div>`
  document.body.appendChild(root)

  const q = (sel) => root.querySelector(sel)
  let onCloseCb = null
  let currentStar = null

  function fillList(sel, items) {
    const ul = q(sel)
    ul.textContent = ''
    const list = Array.isArray(items) ? items : []
    if (list.length === 0) {
      const li = document.createElement('li')
      li.textContent = t('card.empty')
      ul.appendChild(li)
      return
    }
    list.forEach((text) => {
      const li = document.createElement('li')
      li.textContent = typeof text === 'string' ? text : String(text)
      ul.appendChild(li)
    })
  }

  function renderChrome() {
    q('.card-flip-back').textContent = t('card.flipBack')
    q('.card-flip-front').textContent = t('card.flipFront')
    q('.card-supersedes-title').textContent = t('card.supersedes')
    q('.card-supersededBy-title').textContent = t('card.supersededBy')
    q('.card-leadsTo-title').textContent = t('card.leadsTo')
    root.querySelectorAll('.card-close').forEach((b) => b.setAttribute('aria-label', t('card.close')))
  }

  function renderStar(star) {
    const branch = BRANCHES[star.branch]
    q('.card-dot').style.background = branch?.color ?? '#fff'
    q('.card-branch').textContent = branchName(star.branch)
    q('.card-year').textContent = `· ${star.year}`
    q('.card-title').textContent = starName(star)
    q('.card-author').textContent = starAuthor(star) || '—'
    q('.card-back-title').textContent = starName(star)

    // Equation (optional). Some papers don't ship a TeX equation.
    const eqEl = q('.card-eq')
    eqEl.textContent = ''
    if (star.equation) {
      try { katex.render(star.equation, eqEl, { displayMode: true, throwOnError: true }) }
      catch { eqEl.textContent = star.equation }
    }

    q('.card-oneliner').textContent = starOneLiner(star)

    // Abstract — longer than oneLiner; shown for paper kind only
    const absEl = q('.card-abstract')
    if (star.abstract) {
      absEl.style.display = ''
      absEl.textContent = star.abstract
    } else {
      absEl.style.display = 'none'
    }

    // Links: arXiv abs URL + any provided sourceUrl
    const linkList = q('.card-links')
    linkList.textContent = ''
    const links = []
    if (star.arxivId) links.push({ href: `https://arxiv.org/abs/${star.arxivId}`, label: `arXiv:${star.arxivId}` })
    if (star.sourceUrl && star.sourceUrl !== `https://arxiv.org/abs/${star.arxivId}`) {
      links.push({ href: star.sourceUrl, label: star.venue || 'Source' })
    }
    if (links.length === 0) {
      linkList.style.display = 'none'
    } else {
      linkList.style.display = ''
      links.forEach((l) => {
        const li = document.createElement('li')
        const a = document.createElement('a')
        a.href = l.href
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        a.textContent = l.label
        li.appendChild(a)
        linkList.appendChild(li)
      })
    }

    fillList('.card-supersedes', star.cardBack?.supersedes)
    fillList('.card-supersededBy', star.cardBack?.supersededBy)
    fillList('.card-leadsTo', star.cardBack?.leadsTo)
  }

  function open(star) {
    currentStar = star
    root.classList.remove('flipped')
    renderChrome()
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

  onLanguageChange(() => {
    renderChrome()
    if (currentStar) renderStar(currentStar)
  })
  renderChrome()
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.classList.contains('open')) close('dismiss')
  })

  return {
    open,
    close,
    onClose(cb) { onCloseCb = cb },
    get isOpen() { return root.classList.contains('open') }
  }
}
