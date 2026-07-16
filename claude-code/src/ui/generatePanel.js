import { t } from '../i18n.js'

// "Generate Idea" HUD panel: user types a topic (or pastes a paper title/abstract),
// the client-side grounding engine in interact/ideaGenerator.js proposes a candidate
// idea + novelty score + grounding papers, previewed here before it's dropped into
// the live scene as a new pulsing star.
export function createGeneratePanel({ onGenerate, onAccept }) {
  const root = document.createElement('div')
  root.className = 'hud hud-generate'
  root.innerHTML = `
    <button class="generate-toggle">${t('generate.label')} ✦</button>
    <div class="generate-body">
      <textarea class="generate-input" rows="2" placeholder="${t('generate.placeholder')}"></textarea>
      <div class="generate-actions">
        <button class="generate-submit">${t('generate.button')}</button>
        <span class="generate-status"></span>
      </div>
      <div class="generate-preview">
        <div class="generate-preview-title"></div>
        <div class="generate-preview-novelty"></div>
        <div class="generate-preview-hyp"></div>
        <button class="generate-accept">Add to atlas ✦</button>
      </div>
    </div>`
  document.body.appendChild(root)

  const toggle = root.querySelector('.generate-toggle')
  const body = root.querySelector('.generate-body')
  const input = root.querySelector('.generate-input')
  const submit = root.querySelector('.generate-submit')
  const status = root.querySelector('.generate-status')
  const preview = root.querySelector('.generate-preview')
  let pending = null

  toggle.addEventListener('click', () => {
    root.classList.toggle('open')
    if (root.classList.contains('open')) input.focus()
  })

  function runGenerate() {
    const q = input.value.trim()
    if (!q) {
      status.textContent = t('generate.empty')
      return
    }
    status.textContent = t('generate.working')
    preview.classList.remove('show')
    // yield a frame so the "working" state paints before the (cheap, synchronous) scoring runs
    requestAnimationFrame(() => {
      pending = onGenerate(q)
      status.textContent = ''
      if (!pending) return
      root.querySelector('.generate-preview-title').textContent = pending.title
      root.querySelector('.generate-preview-novelty').textContent = `Novelty score ${pending.noveltyScore}/100`
      root.querySelector('.generate-preview-hyp').textContent = pending.oneLiner
      preview.classList.add('show')
    })
  }

  submit.addEventListener('click', runGenerate)
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runGenerate()
  })

  root.querySelector('.generate-accept').addEventListener('click', () => {
    if (!pending) return
    onAccept(pending)
    preview.classList.remove('show')
    input.value = ''
    root.classList.remove('open')
    pending = null
  })

  return {
    open() {
      root.classList.add('open')
      input.focus()
    }
  }
}
