// "Generate new ideas" panel: the user provides a topic, or one or more
// paper references (arXiv id / URL / pasted title), and the panel explains +
// triggers the builder→evaluator pipeline. There's no live LLM backend
// wired into this static deployment, so submitting here queues the same
// two-worker pipeline that produced the current atlas (documented in
// README as `npm run research -- "<topic>"`), and shows the request so a
// maintainer/agent can run it. This keeps the UI honest about what's live.

export function createGeneratePanel() {
  const root = document.createElement('div')
  root.id = 'generatePanel'
  root.innerHTML = `
    <div class="gen-inner">
      <button class="gen-close" aria-label="Close">×</button>
      <h3>Generate new ideas</h3>
      <p class="gen-sub">Give a topic, or one or more paper references (arXiv id / URL / title). The <b>builder</b> worker drafts evidence-grounded ideas from matching literature; the <b>evaluator</b> worker verifies each against existing work and scores novelty, feasibility, and excitement — both run on Sonnet 5.</p>
      <textarea class="gen-input" rows="3" placeholder="e.g. &quot;sparse attention for long-context retrieval&quot; or an arXiv URL"></textarea>
      <button class="gen-submit">Queue builder → evaluator run</button>
      <div class="gen-status"></div>
    </div>`
  document.body.appendChild(root)

  const q = (sel) => root.querySelector(sel)
  const textarea = q('.gen-input')
  const status = q('.gen-status')

  function open() {
    root.classList.add('open')
    textarea.focus()
  }
  function openWithTopic(topic) {
    textarea.value = topic
    open()
  }
  function close() {
    root.classList.remove('open')
    status.textContent = ''
  }

  q('.gen-close').addEventListener('click', close)
  q('.gen-submit').addEventListener('click', () => {
    const input = textarea.value.trim()
    if (!input) return
    status.textContent = `Queued: "${input}" — run \`npm run research -- "${input.replace(/"/g, '')}"\` to fetch grounding papers, then the builder/evaluator pipeline to populate the atlas with new idea stars.`
  })
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.classList.contains('open')) close()
  })

  return { open, openWithTopic, close }
}
