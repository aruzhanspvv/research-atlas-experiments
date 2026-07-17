// Idea panel — sibling of starCard, but for AI-generated research ideas.
// Always a fresh DOM instance per open so render is predictable. Closes on Esc
// via the same window listener pattern as starCard.

import { createNoveltyGauge, createBreakdownList } from './noveltyGauge.js'
import { t } from '../i18n.js'

export function createIdeaCard() {
  const root = document.createElement('div')
  root.id = 'ideaCard'
  root.innerHTML = `
    <div class="card-inner">
      <section class="card-face card-front">
        <button class="card-close" aria-label="Close">×</button>
        <div class="card-meta">
          <i class="card-dot"></i>
          <span class="card-branch"></span>
          <span class="card-year"></span>
          <span class="card-kind">${t('idea.tagline')}</span>
        </div>
        <h2 class="card-title"></h2>
        <div class="card-author"></div>
        <div class="card-novelty-row">
          <div class="novelty-slot"></div>
          <div class="card-pattern"></div>
        </div>
        <p class="card-oneliner"></p>
        <div class="card-abstract"></div>
        <h4 class="card-evidence-title">${t('idea.evidence')}</h4>
        <ul class="card-evidence"></ul>
        <h4 class="card-grounding-title">${t('idea.generatedFrom')}</h4>
        <ul class="card-grounding"></ul>
        <div class="card-footer">
          <span class="card-transport"></span>
          <button class="card-methodology">${t('idea.about')}</button>
        </div>
      </section>
    </div>`
  document.body.appendChild(root)

  const q = (sel) => root.querySelector(sel)
  let currentIdea = null
  let onCloseCb = null

  function fillList(sel, items, formatter) {
    const ul = q(sel)
    ul.textContent = ''
    items.forEach((item) => {
      const li = document.createElement('li')
      if (formatter) {
        const html = formatter(item)
        if (html) li.innerHTML = html
        else li.textContent = String(item)
      } else {
        li.textContent = String(item)
      }
      ul.appendChild(li)
    })
  }

  function open(idea) {
    currentIdea = idea
    root.classList.remove('flipped')
    renderIdea(idea)
    root.classList.add('open')
  }

  function renderIdea(idea) {
    q('.card-title').textContent = idea.name ?? idea.title ?? '(untitled idea)'
    q('.card-year').textContent = `· ${idea.year ?? new Date().getFullYear()}`
    const branchName = t(`branch.${idea.branch}`) || idea.branch
    q('.card-branch').textContent = branchName
    q('.card-dot').style.background = `var(--branch-${idea.branch}, rgba(150,180,255,0.6))`

    // Authors line: hide for AI (no human authors)
    q('.card-author').textContent = idea.authors?.length ? idea.authors.join(', ') : '—'

    // Novelty gauge + pattern label
    const slot = q('.novelty-slot')
    slot.textContent = ''
    slot.appendChild(createNoveltyGauge(idea.novelty ?? 50, idea.noveltyBreakdown ?? null))

    q('.card-pattern').textContent = idea.ideationPattern ? `· ${idea.ideationPattern}` : ''

    q('.card-oneliner').textContent = idea.summary ?? ''
    q('.card-abstract').textContent = idea.abstract ?? ''

    fillList('.card-evidence', idea.evidence ?? [], (ev) => {
      const quote = (ev?.quote ?? '').slice(0, 220)
      const from = ev?.from ?? 'unknown'
      const safe = quote.replace(/[<>]/g, '')
      return `"${safe}" — <em>${from}</em>`
    })

    fillList('.card-grounding', idea.generatedFrom ?? [], (id) => `<code>${id}</code>`)

    const transportLabel = idea.transport === 'mock' ? t('idea.transportMock')
      : idea.transport === 'live-retry' ? t('idea.transportRetry')
      : idea.transport === 'live' ? t('idea.transportLive') : ''
    q('.card-transport').textContent = transportLabel
  }

  q('.card-close').addEventListener('click', () => close('dismiss'))
  q('.card-methodology').addEventListener('click', () => {
    const body = `${t('idea.aboutText')}\n\nCitations:\n· ${t('idea.novelty')} = 0.50·d + 0.20·cov + 0.15·opp + 0.15·par.\n· arXiv:2607.04439 — ResearchStudio-Idea (idea patterns, Scoop-Check).\n· arXiv:2607.01233 — Measuring the Gap Between Human and LLM Research Ideas (opportunity-pattern × research-paradigm taste taxonomy).`
    alert(body)
  })

  function close(reason = 'program') {
    if (!root.classList.contains('open')) return
    root.classList.remove('open')
    currentIdea = null
    onCloseCb?.(reason)
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.classList.contains('open')) close('dismiss')
  })

  return {
    open,
    close,
    onClose(cb) { onCloseCb = cb },
    get isOpen() { return root.classList.contains('open') },
    get currentIdea() { return currentIdea }
  }
}
