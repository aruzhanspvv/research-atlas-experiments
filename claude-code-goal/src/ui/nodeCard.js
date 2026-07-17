import { BRANCHES } from '../data/sources.js'

// Detail panel: same glass-card language as the reference atlas. Shows paper
// metadata+abstract for paper nodes; for idea nodes it shows the hypothesis,
// method sketch, grounding papers, and a distinct radial novelty-score gauge
// (conic-gradient ring + numeric readout + a 3-bar breakdown of
// novelty/feasibility/excitement, echoing the evaluation axes used in
// "Measuring the Gap Between Human and LLM Research Ideas").

export function createNodeCard({ byId, onJump }) {
  const root = document.createElement('div')
  root.id = 'nodeCard'
  root.innerHTML = `
    <div class="card-inner">
      <section class="card-face card-front">
        <button class="card-close" aria-label="Close">×</button>
        <div class="card-meta"><i class="card-dot"></i><span class="card-source"></span><span class="card-year"></span></div>
        <h2 class="card-title"></h2>
        <div class="card-authors"></div>

        <div class="card-paper-body">
          <p class="card-abstract"></p>
          <a class="card-link" target="_blank" rel="noopener">View source →</a>
        </div>

        <div class="card-idea-body">
          <div class="card-novelty">
            <div class="novelty-ring"><span class="novelty-num"></span><span class="novelty-label">novelty</span></div>
            <div class="novelty-bars">
              <div class="novelty-bar-row"><span>Novelty</span><div class="bar"><i data-k="novelty"></i></div><b data-v="novelty"></b></div>
              <div class="novelty-bar-row"><span>Feasibility</span><div class="bar"><i data-k="feasibility"></i></div><b data-v="feasibility"></b></div>
              <div class="novelty-bar-row"><span>Excitement</span><div class="bar"><i data-k="excitement"></i></div><b data-v="excitement"></b></div>
            </div>
            <div class="card-risk"></div>
          </div>
          <div class="card-sec"><h4>Hypothesis</h4><p class="card-hypothesis"></p></div>
          <div class="card-sec"><h4>Description</h4><p class="card-description"></p></div>
          <div class="card-sec"><h4>Method sketch</h4><p class="card-method"></p></div>
          <div class="card-sec"><h4>Grounded in</h4><ul class="card-grounded"></ul></div>
          <div class="card-sec card-rationale-sec" style="display:none"><h4>Evaluator rationale</h4><p class="card-rationale"></p></div>
        </div>
      </section>
    </div>`
  document.body.appendChild(root)

  const q = (sel) => root.querySelector(sel)
  let onCloseCb = null

  function branchDot(key) {
    return BRANCHES[key]?.color ?? '#888'
  }

  function renderPaper(node) {
    q('.card-paper-body').style.display = ''
    q('.card-idea-body').style.display = 'none'
    q('.card-abstract').textContent = node.abstract || ''
    const link = q('.card-link')
    if (node.url) {
      link.href = node.url
      link.style.display = ''
    } else {
      link.style.display = 'none'
    }
  }

  function bar(key, value) {
    const fill = q(`.bar i[data-k="${key}"]`)
    const label = q(`b[data-v="${key}"]`)
    fill.style.width = `${Math.round(value)}%`
    label.textContent = Math.round(value)
  }

  function renderIdea(node) {
    q('.card-paper-body').style.display = 'none'
    q('.card-idea-body').style.display = ''
    q('.card-hypothesis').textContent = node.hypothesis || ''
    q('.card-description').textContent = node.description || ''
    q('.card-method').textContent = node.method || ''

    const score = Math.round(node.noveltyScore ?? 0)
    q('.novelty-num').textContent = score
    q('.novelty-ring').style.setProperty('--pct', `${score}%`)
    q('.novelty-ring').style.setProperty(
      '--hue',
      `${Math.round(280 - (score / 100) * 100)}`
    )

    const b = node.noveltyBreakdown || {}
    bar('novelty', b.novelty ?? score)
    bar('feasibility', b.feasibility ?? 50)
    bar('excitement', b.excitement ?? 50)

    const risk = node.riskLevel || 'ambitious'
    const riskEl = q('.card-risk')
    riskEl.textContent = risk.replace('-', ' ')
    riskEl.className = `card-risk risk-${risk}`

    const ul = q('.card-grounded')
    ul.textContent = ''
    ;(node.groundedIn || []).forEach((pid) => {
      const paper = byId.get(pid)
      const li = document.createElement('li')
      li.textContent = paper ? paper.title : pid
      li.addEventListener('click', () => paper && onJump?.(paper))
      ul.appendChild(li)
    })

    const rationaleSec = q('.card-rationale-sec')
    if (node.rationale) {
      rationaleSec.style.display = ''
      q('.card-rationale').textContent = node.rationale
    } else {
      rationaleSec.style.display = 'none'
    }
  }

  function open(node) {
    const branchKey = node.branch
    q('.card-dot').style.background = branchDot(branchKey)
    q('.card-source').textContent = BRANCHES[branchKey]?.label ?? branchKey
    q('.card-year').textContent = node.year ? `· ${node.year}` : ''
    q('.card-title').textContent = node.title
    q('.card-authors').textContent =
      node.type === 'idea' ? 'Research Atlas · Generated Idea' : (node.authors || []).join(', ')

    if (node.type === 'idea') renderIdea(node)
    else renderPaper(node)

    root.classList.add('open')
  }

  function close(reason = 'program') {
    if (!root.classList.contains('open')) return
    root.classList.remove('open')
    onCloseCb?.(reason)
  }

  root.querySelectorAll('.card-close').forEach((b) => b.addEventListener('click', () => close('dismiss')))
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close('dismiss')
  })

  return {
    open,
    close,
    onClose(cb) {
      onCloseCb = cb
    },
    get isOpen() {
      return root.classList.contains('open')
    }
  }
}
