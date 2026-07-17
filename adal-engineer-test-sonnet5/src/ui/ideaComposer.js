// Idea composer: the HUD panel where the user drives idea generation.
// Two tabs = the two interactive use cases from the user goal:
//   UC2 "topic"  — free-text research topic -> generated ideas
//   UC3 "papers" — one or more paper refs (arXiv ID/URL/title) -> ideas
// Handles the client-side half of edge cases C2 (empty topic) and C3
// (invalid reference) by disabling submit until input looks non-empty;
// server-side validation (EMPTY_TOPIC/INVALID_REFERENCE/etc) is the
// authoritative check and its messages are surfaced verbatim in the toast.
export function createIdeaComposer({ onGenerate, onStatusCheck }) {
  const root = document.createElement('div')
  root.id = 'ideaComposer'
  root.innerHTML = `
    <div class="composer-tabs">
      <button class="composer-tab active" data-mode="topic">Topic</button>
      <button class="composer-tab" data-mode="papers">Paper refs</button>
    </div>
    <div class="composer-body">
      <textarea class="composer-input" data-mode="topic" placeholder="Describe a research topic, e.g. &quot;evaluating chain-of-thought faithfulness under length penalties&quot;" rows="2"></textarea>
      <textarea class="composer-input" data-mode="papers" style="display:none" placeholder="Paste one or more arXiv IDs / URLs / titles, one per line, e.g.&#10;2607.04439&#10;https://arxiv.org/abs/2607.01233" rows="2"></textarea>
      <button class="composer-submit">Generate ideas</button>
    </div>
    <div class="composer-status"></div>`
  document.body.appendChild(root)

  const tabs = [...root.querySelectorAll('.composer-tab')]
  const inputs = [...root.querySelectorAll('.composer-input')]
  const submitBtn = root.querySelector('.composer-submit')
  const statusEl = root.querySelector('.composer-status')

  let mode = 'topic'

  function setMode(next) {
    mode = next
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.mode === next))
    inputs.forEach((i) => {
      i.style.display = i.dataset.mode === next ? '' : 'none'
    })
  }
  tabs.forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)))

  function activeInput() {
    return inputs.find((i) => i.dataset.mode === mode)
  }

  function setStatus(text, kind = 'info') {
    statusEl.textContent = text
    statusEl.className = `composer-status composer-status--${kind}`
  }

  function setBusy(busy) {
    submitBtn.disabled = busy
    submitBtn.textContent = busy ? 'Generating…' : 'Generate ideas'
  }

  async function submit() {
    const raw = activeInput().value.trim()
    // C2/C3 client-side guard: block empty submissions before hitting the
    // network at all (server still validates authoritatively).
    if (!raw) {
      setStatus(mode === 'topic' ? 'Please enter a research topic first.' : 'Please paste at least one paper reference first.', 'error')
      return
    }

    setBusy(true)
    setStatus('Checking generation availability…', 'info')
    try {
      const status = await onStatusCheck()
      if (!status.llmConfigured) {
        setStatus('Idea generation is unavailable: no LLM API key configured on the server. See README for setup.', 'error')
        setBusy(false)
        return
      }
    } catch {
      // C1: network/API unreachable — surface clearly, do not hang.
      setStatus('Could not reach the server. Check your connection and that the backend is running.', 'error')
      setBusy(false)
      return
    }

    setStatus('Generating ideas — this can take up to a minute…', 'info')
    try {
      const payload =
        mode === 'topic'
          ? { mode: 'topic', topic: raw }
          : { mode: 'papers', paperRefs: raw.split('\n').map((s) => s.trim()).filter(Boolean) }
      const result = await onGenerate(payload)
      if (result.exploratory) {
        setStatus(result.message || 'No related papers found; try a different topic.', 'error')
      } else if (result.ideas?.length) {
        setStatus(`Generated ${result.ideas.length} new idea${result.ideas.length > 1 ? 's' : ''}. Look for the pulsing aura in the map.`, 'success')
        activeInput().value = ''
      } else {
        setStatus('Generation completed but returned no ideas. Try again or rephrase.', 'error')
      }
    } catch (err) {
      setStatus(err.message || 'Generation failed. Please try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  submitBtn.addEventListener('click', submit)
  inputs.forEach((i) => {
    i.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
    })
  })

  // Starts CLOSED (default UI state) — the composer only becomes visible
  // (and pointer-reachable, via the .open CSS rule's pointer-events:auto)
  // when the user explicitly clicks the ✦ toggle button. An earlier attempt
  // to fix a "Generate ideas" click-through bug incorrectly made this start
  // permanently open, which meant the composer overlapped the node detail
  // card on every load regardless of user intent — the real click-through
  // fix belongs in the .open CSS rule (already correct: pointer-events:auto),
  // not in defaulting the panel open.
  function settleAnimations() {
    root.getAnimations().forEach((anim) => anim.cancel())
  }

  function open() {
    settleAnimations()
    root.classList.add('open')
  }

  function close() {
    if (!root.classList.contains('open')) return
    settleAnimations()
    root.classList.remove('open')
  }

  function toggle() {
    // Bug #2 defense-in-depth: cancel any in-flight open/close transition
    // before starting a new one, same rationale as nodeCard.js's
    // settleAnimations() — prevents a stuck transition from a rapid
    // toggle sequence leaving this panel in a visually-frozen state.
    if (root.classList.contains('open')) close()
    else open()
  }

  return {
    toggle,
    open,
    close,
    root,
    get isOpen() {
      return root.classList.contains('open')
    }
  }
}
