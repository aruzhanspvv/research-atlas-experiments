// Ideation panel — the input UI for the three generation entry points.
// Does NOT call the LLM directly: it builds a { topic?, papers?, mode } payload
// and hands it to main.js, which routes through src/lib/ideate.js. Missing key
// surfaces an inline notice (no crash); in-flight requests are tracked here to
// allow debouncing.

import { llmStatus } from '../lib/llm.js'
import { listPatterns } from '../lib/llm.js'
import { tokeniseInput } from '../lib/arxiv.js'
import { t } from '../i18n.js'

export function createIdeatePanel({ onSubmit, onSelect, starsById }) {
  const root = document.createElement('div')
  root.id = 'ideatePanel'
  root.className = 'hud ideate-panel'

  root.innerHTML = `
    <div class="ideate-tabs">
      <button class="ideate-tab active" data-mode="topic">${t('idea.topicBtn')}</button>
      <button class="ideate-tab" data-mode="papers">${t('idea.papersBtn')}</button>
      <button class="ideate-tab" data-mode="latest-papers">${t('idea.latestBtn')}</button>
    </div>
    <div class="ideate-body" data-pane="topic">
      <label>${t('idea.topicLabel')}
        <textarea class="ideate-topic" rows="2" placeholder="${t('idea.topicPlaceholder')}"></textarea>
      </label>
    </div>
    <div class="ideate-body" data-pane="papers" hidden>
      <label>${t('idea.papersLabel')}
        <textarea class="ideate-papers" rows="3" placeholder="${t('idea.papersPlaceholder')}"></textarea>
      </label>
      <div class="ideate-paper-hint"></div>
    </div>
    <div class="ideate-body" data-pane="latest-papers" hidden>
      <div class="ideate-latest-text">Uses the seed papers in the atlas as grounding. Click Generate to produce one idea.</div>
    </div>
    <div class="ideate-actions">
      <button class="ideate-generate">${t('idea.generate')}</button>
      <span class="ideate-status"></span>
    </div>
    <div class="ideate-key-warn" hidden></div>
  `
  document.body.appendChild(root)

  const tabs = root.querySelectorAll('.ideate-tab')
  const panes = root.querySelectorAll('.ideate-body')
  const topicInput = root.querySelector('.ideate-topic')
  const papersInput = root.querySelector('.ideate-papers')
  const paperHint = root.querySelector('.ideate-paper-hint')
  const generateBtn = root.querySelector('.ideate-generate')
  const statusEl = root.querySelector('.ideate-status')
  const keyWarn = root.querySelector('.ideate-key-warn')
  let mode = 'topic'
  let inflight = false

  function setMode(next) {
    mode = next
    tabs.forEach((b) => b.classList.toggle('active', b.dataset.mode === next))
    panes.forEach((p) => { p.hidden = p.dataset.pane !== next })
  }

  tabs.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)))

  // Live-resolve pasted ids → show as chips; non-arxiv tokens become "free text" hints.
  papersInput.addEventListener('input', () => {
    const { ids, titles } = tokeniseInput(papersInput.value)
    paperHint.innerHTML = ''
    if (!ids.length && !titles.length) return
    ids.forEach((id) => {
      const chip = document.createElement('span')
      chip.className = 'ideate-chip ideate-chip-id'
      chip.textContent = id
      paperHint.appendChild(chip)
    })
    titles.forEach((t) => {
      const chip = document.createElement('span')
      chip.className = 'ideate-chip ideate-chip-title'
      chip.textContent = `"${t.length > 40 ? t.slice(0, 38) + '…' : t}"`
      paperHint.appendChild(chip)
    })
  })

  function refreshKeyWarning() {
    const s = llmStatus()
    if (!s.ready && s.reason !== 'mock') {
      keyWarn.hidden = false
      keyWarn.textContent = `${t('idea.errorKeyShort')}: ${s.reason}`
    } else {
      keyWarn.hidden = true
    }
  }

  // Render the missing-key inline error using the ACTUAL env var name from
  // llmStatus().reason (matches the apiKeyBanner treatment). Falls back to a
  // generic placeholder if status is unexpectedly ready/reason-empty.
  function renderErrorKey() {
    const r = (llmStatus().reason || '').replace(/^missing\s+/i, '') || 'VITE_LLM_*'
    return t('idea.errorKey', { var: r })
  }

  function setInflight(on, message) {
    inflight = !!on
    generateBtn.disabled = inflight
    generateBtn.textContent = inflight ? t('idea.generating') : t('idea.generate')
    // Only overwrite the status text if a non-null message is provided.
    if (message !== null) statusEl.textContent = message ?? ''
  }

  generateBtn.addEventListener('click', async () => {
    refreshKeyWarning()
    const status = llmStatus()
    if (!status.ready && status.reason !== 'mock') {
      statusEl.textContent = renderErrorKey()
      return
    }
    if (inflight) return
    let payload
    if (mode === 'topic') {
      const topic = topicInput.value.trim()
      if (!topic) { statusEl.textContent = t('card.empty'); return }
      payload = { topic, mode: 'topic' }
    } else if (mode === 'papers') {
      const text = papersInput.value.trim()
      if (!text) { statusEl.textContent = t('card.empty'); return }
      const { ids, titles } = tokeniseInput(text)
      payload = { mode: 'papers', papers: ids.length ? ids : titles }
    } else {
      payload = { mode: 'latest-papers' }
    }
    setInflight(true, t('idea.generating'))
    try {
      const beforeStatus = statusEl.textContent
      await onSubmit(payload)
      // If onSubmit wrote a user-facing message (e.g. speculative notice or
      // dedupe note), keep it. Otherwise show the generic ✓ success marker.
      const afterStatus = statusEl.textContent
      if (afterStatus === beforeStatus || afterStatus === t('idea.generating')) {
        setInflight(false, '✓')
        setTimeout(() => { if (!inflight) statusEl.textContent = '' }, 1500)
      } else {
        setInflight(false, null)
      }
    } catch (err) {
      setInflight(false, '×')
      const name = err?.name ?? 'Error'
      if (name === 'MissingApiKeyError') statusEl.textContent = renderErrorKey()
      else if (name === 'LLMNetworkError') statusEl.textContent = t('idea.errorNetwork')
      else if (name === 'LLMParsedError') statusEl.textContent = t('idea.errorParse')
      else statusEl.textContent = err?.message ?? String(err)
    }
  })

  return {
    root,
    refreshKeyWarning,
    setMode,
    isInflight: () => inflight
  }
}
