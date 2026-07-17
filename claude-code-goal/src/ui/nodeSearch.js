// Search + "Generate ideas" HUD: type a term to fly to a matching paper/idea.
// If nothing matches, offer to queue a new builder→evaluator run for that
// topic (documented in the README as `npm run research -- "topic"` — this
// demo's atlas is the output of one such run already merged in).

export function createNodeSearch({ nodes, onSelect, onGenerate }) {
  const root = document.createElement('div')
  root.className = 'hud hud-search'
  root.innerHTML = `
    <input class="search-input" type="text" spellcheck="false" placeholder="Search papers &amp; ideas, or type a topic to generate…" />
    <ul class="search-results"></ul>`
  document.body.appendChild(root)

  const input = root.querySelector('.search-input')
  const list = root.querySelector('.search-results')
  let results = []
  let query = ''

  function match(qRaw) {
    const q = qRaw.trim().toLowerCase()
    if (!q) return []
    const scored = []
    nodes.forEach((s) => {
      const fields = [s.title, ...(s.authors || []), s.hypothesis || '']
      let best = -1
      fields.forEach((f) => {
        const t = (f || '').toLowerCase()
        if (t.startsWith(q)) best = Math.max(best, 2)
        else if (t.includes(q)) best = Math.max(best, 1)
      })
      if (best > 0) scored.push({ s, best })
    })
    return scored
      .sort((a, b) => b.best - a.best || (b.s.influence ?? 0) - (a.s.influence ?? 0))
      .slice(0, 8)
      .map((r) => r.s)
  }

  function renderResults() {
    list.textContent = ''
    results.forEach((s, i) => {
      const li = document.createElement('li')
      li.className = i === 0 ? 'hit' : ''
      const name = document.createElement('span')
      name.textContent = s.title
      const meta = document.createElement('i')
      meta.textContent = s.type === 'idea' ? `novelty ${Math.round(s.noveltyScore ?? 0)}` : `${s.year ?? ''}`
      li.append(name, meta)
      li.addEventListener('click', () => select(s))
      list.appendChild(li)
    })
    if (results.length === 0 && query.trim().length > 1) {
      const li = document.createElement('li')
      li.className = 'generate-hit'
      const name = document.createElement('span')
      name.textContent = `Generate ideas about "${query.trim()}"`
      li.append(name)
      li.addEventListener('click', () => generate())
      list.appendChild(li)
    }
    root.classList.toggle('has-results', results.length > 0 || query.trim().length > 1)
  }

  function select(node) {
    input.value = ''
    query = ''
    results = []
    renderResults()
    input.blur()
    onSelect(node)
  }

  function generate() {
    const topic = query.trim()
    input.value = ''
    query = ''
    results = []
    renderResults()
    input.blur()
    onGenerate?.(topic)
  }

  input.addEventListener('input', () => {
    query = input.value
    results = match(input.value)
    renderResults()
  })
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      if (results[0]) select(results[0])
      else if (query.trim().length > 1) generate()
    }
    if (e.key === 'Escape') {
      input.value = ''
      query = ''
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
      query = ''
      results = []
      renderResults()
      input.blur()
    }
  }
}
