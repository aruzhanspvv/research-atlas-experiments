// 搜索框：输入定律名 / 人名，直接飞到那颗星。
// 快捷键 "/" 聚焦；Enter 选第一项；Esc 收起。

import { onLanguageChange, starAuthor, starName, t } from '../i18n.js'

export function createSearchBox({ stars, onSelect }) {
  const root = document.createElement('div')
  root.className = 'hud hud-search'
  root.innerHTML = `
    <input class="search-input" type="text" spellcheck="false" />
    <ul class="search-results"></ul>`
  document.body.appendChild(root)

  const input = root.querySelector('.search-input')
  const list = root.querySelector('.search-results')
  let results = []

  // Schema-tolerant: handles the legacy {zh, en} shape and the new flat shape.
  function searchText(s) {
    const out = []
    if (typeof s.name === 'string') out.push(s.name)
    else if (s.name && typeof s.name === 'object') {
      if (typeof s.name.zh === 'string') out.push(s.name.zh)
      if (typeof s.name.en === 'string') out.push(s.name.en)
    }
    if (Array.isArray(s.authors)) s.authors.forEach((a) => typeof a === 'string' && out.push(a))
    if (typeof s.author === 'string') out.push(s.author)
    else if (s.author && typeof s.author === 'object') {
      if (typeof s.author.zh === 'string') out.push(s.author.zh)
      if (typeof s.author.en === 'string') out.push(s.author.en)
    }
    return out
  }

  function match(qRaw) {
    const q = qRaw.trim().toLowerCase()
    if (!q) return []
    const scored = []
    stars.forEach((s) => {
      const fields = searchText(s).filter(Boolean)
      let best = -1
      fields.forEach((f) => {
        const t = f.toLowerCase()
        if (t.startsWith(q)) best = Math.max(best, 2)
        else if (t.includes(q)) best = Math.max(best, 1)
      })
      if (best > 0) scored.push({ s, best })
    })
    return scored
      .sort((a, b) => b.best - a.best || b.s.influence - a.s.influence)
      .slice(0, 8)
      .map((r) => r.s)
  }

  function renderResults() {
    list.textContent = ''
    results.forEach((s, i) => {
      const li = document.createElement('li')
      li.className = i === 0 ? 'hit' : ''
      const name = document.createElement('span')
      name.textContent = starName(s)
      const meta = document.createElement('i')
      meta.textContent = `${starAuthor(s)} · ${s.year}`
      li.append(name, meta)
      li.addEventListener('click', () => select(s))
      list.appendChild(li)
    })
    root.classList.toggle('has-results', results.length > 0)
  }

  function select(star) {
    input.value = ''
    results = []
    renderResults()
    input.blur()
    onSelect(star)
  }

  input.addEventListener('input', () => {
    results = match(input.value)
    renderResults()
  })
  input.addEventListener('keydown', (e) => {
    e.stopPropagation() // 输入时不触发全局快捷键
    if (e.key === 'Enter' && results[0]) select(results[0])
    if (e.key === 'Escape') {
      input.value = ''
      results = []
      renderResults()
      input.blur()
    }
  })
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== input) {
      e.preventDefault()
      input.focus()
    }
  })

  function renderLanguage() {
    input.placeholder = t('search.placeholder')
    renderResults()
  }
  onLanguageChange(renderLanguage)
  renderLanguage()

  return {
    focus: () => input.focus(),
    clear() {
      input.value = ''
      results = []
      renderResults()
      input.blur()
    }
  }
}
