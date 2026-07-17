// Search box: type a paper title / idea title / author name -> fly to it.
// "/" focuses; Enter selects first match; Esc collapses. i18n dropped
// (English only per contract); logic otherwise unchanged from physics-atlas.

export function createSearchBox({ nodes, onSelect }) {
  const root = document.createElement('div')
  root.className = 'hud hud-search'
  root.innerHTML = `
    <input class="search-input" type="text" spellcheck="false" placeholder="Search papers, ideas, authors... ( / )" />
    <ul class="search-results"></ul>`
  document.body.appendChild(root)

  const input = root.querySelector('.search-input')
  const list = root.querySelector('.search-results')
  let results = []

  function match(qRaw) {
    const q = qRaw.trim().toLowerCase()
    if (!q) return []
    const scored = []
    nodes.forEach((n) => {
      const fields = [n.title, ...(n.authors ?? []), ...(n.topics ?? [])]
      let best = -1
      fields.forEach((f) => {
        const t = (f || '').toLowerCase()
        if (t.startsWith(q)) best = Math.max(best, 2)
        else if (t.includes(q)) best = Math.max(best, 1)
      })
      if (best > 0) {
        const weight = n.influence ?? (n.noveltyScore ?? 0.5) * 5
        scored.push({ n, best, weight })
      }
    })
    return scored
      .sort((a, b) => b.best - a.best || b.weight - a.weight)
      .slice(0, 8)
      .map((r) => r.n)
  }

  function renderResults() {
    list.textContent = ''
    results.forEach((n, i) => {
      const li = document.createElement('li')
      li.className = i === 0 ? 'hit' : ''
      const name = document.createElement('span')
      name.textContent = n.title
      const meta = document.createElement('i')
      meta.textContent = n.type === 'idea' ? `idea · novelty ${Math.round((n.noveltyScore ?? 0) * 100)}` : `${n.year ?? ''}`
      li.append(name, meta)
      li.addEventListener('click', () => select(n))
      list.appendChild(li)
    })
    root.classList.toggle('has-results', results.length > 0)
  }

  function select(node) {
    input.value = ''
    results = []
    renderResults()
    input.blur()
    onSelect(node)
  }

  input.addEventListener('input', () => {
    results = match(input.value)
    renderResults()
  })
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
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
