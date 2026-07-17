// i18n — English only (the original Chinese strings are gone; the project is now
// a research-idea atlas, not a bilingual physics atlas). Kept the API shape
// (getLanguage / setLanguage / onLanguageChange / t / branchName / ...) so the
// rest of the code can stay untouched.

export const LANGUAGES = {
  en: { label: 'EN', name: 'English', htmlLang: 'en' }
}

const TEXT = {
  en: {
    app: {
      title: 'Research Idea Atlas',
      subtitle: 'arXiv × AI ideation',
      documentTitle: 'Research Idea Atlas',
      branchLegend: 'Field legend',
      styleSwitcher: 'Visual style',
      lensSwitcher: 'Lens',
      hint: 'DRAG TO ORBIT  ·  SCROLL TO ZOOM',
      resetView: 'Reset view'
    },
    branch: {
      mechanics: 'Classical Mechanics',
      em: 'Electromagnetism',
      thermo: 'Thermodynamics',
      relativity: 'Relativity',
      quantum: 'Quantum Physics',
      cosmology: 'Cosmology'
    },
    lens: {
      galaxy: 'Galaxy',
      timeline: 'Timeline',
      scale: 'Scale'
    },
    axis: {
      timelineTitle: 'Time →',
      scaleTitle: 'Spatial Scale · Micro → Macro',
      particle: 'Particle',
      atom: 'Atom',
      matter: 'Matter',
      object: 'Object',
      planet: 'Planet',
      universe: 'Universe'
    },
    preset: {
      deepfield: 'Deep Field',
      interstellar: 'Interstellar'
    },
    search: {
      placeholder: 'Search papers · ideas  /'
    },
    card: {
      close: 'Close',
      flipBack: 'Lineage ⟶',
      flipFront: '⟵ Front',
      empty: '—'
    },
    idea: {
      tagline: 'AI-generated research idea',
      novelty: 'Novelty',
      noveltyShort: 'N',
      evidence: 'Evidence',
      grounding: 'Grounded in',
      generatedFrom: 'Generated from',
      pattern: 'Pattern',
      transport: 'Source',
      transportMock: 'Mock LLM (offline)',
      transportLive: 'Live LLM',
      transportRetry: 'Live LLM (retry)',
      errorKey: 'LLM not configured. Add {var} to .env.local and reload to enable live generation.',
      errorKeyShort: 'No LLM key',
      errorNetwork: 'LLM network error. Generation failed.',
      errorParse: 'LLM returned an unparseable response. Retry may help.',
      errorArxiv: 'arXiv fetch failed. Check network or invalid id.',
      ideaPanelTitle: 'Generate research ideas',
      topicLabel: 'High-level topic',
      topicPlaceholder: 'e.g. "interpretable surrogate models for gravitational waveforms"',
      papersLabel: 'Ground in papers (arXiv ids or titles, comma-separated)',
      papersPlaceholder: 'e.g. "1908.08959, 2306.11554" or paste paper titles',
      generate: 'Generate',
      generating: 'Generating…',
      cancel: 'Cancel',
      latestBtn: 'From latest papers',
      topicBtn: 'From a topic',
      papersBtn: 'From pasted refs',
      noGrounding: 'No grounding papers — speculative idea.',
      about: 'About this methodology',
      aboutText: 'Novelty = 0.50·distance + 0.20·evidence + 0.15·opportunity + 0.15·paradigm. Distance is mean Jaccard distance to grounding-paper keywords (Scoop-Check, arXiv:2607.04439). The opportunity and paradigm bonuses down-weight "bridge" and "synthesis" because LLMs over-cluster there (arXiv:2607.01233).',
      dedupeNote: 'Same idea not added twice.'
    },
    banner: {
      apiKeyTitle: 'Idea generation disabled',
      apiKeyBody: 'Set {var} in .env.local to enable live generation. The atlas stays fully usable — only the Ideate button is disabled. For local testing, set VITE_LLM_MOCK=1 to use the deterministic offline generator.'
    }
  }
}

const listeners = new Set()
let currentLang = 'en'

function applyDocumentLanguage() {
  const meta = LANGUAGES[currentLang]
  document.documentElement.lang = meta.htmlLang
  document.body.dataset.lang = currentLang
  document.title = t('app.documentTitle')
}

export function getLanguage() { return currentLang }
export function setLanguage(lang) {
  if (lang !== 'en' || lang === currentLang) return
  currentLang = lang
  localStorage.setItem('physics-star-atlas-lang', lang)
  const url = new URL(window.location.href)
  url.searchParams.set('lang', lang)
  history.replaceState(null, '', url)
  applyDocumentLanguage()
  listeners.forEach((fn) => fn(lang))
}
export function onLanguageChange(fn) { listeners.add(fn); return () => listeners.delete(fn) }

export function localize(value, lang = currentLang) {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return value[lang] ?? value.zh ?? value.en ?? value ?? ''
}

export function t(path, vars = {}) {
  const value = path.split('.').reduce((acc, part) => acc?.[part], TEXT[currentLang])
  let text = typeof value === 'string' ? value : path
  Object.entries(vars).forEach(([key, val]) => {
    text = text.replaceAll(`{${key}}`, String(val))
  })
  return text
}

export function branchName(branch) { return t(`branch.${branch}`) }
export function presetLabel(key) { return t(`preset.${key}`) }
export function starName(star) { return star?.name ?? '' }
export function starAuthor(star) {
  if (!star) return ''
  if (Array.isArray(star.authors) && star.authors.length) return star.authors.join(', ')
  if (typeof star.author === 'string') return star.author
  if (star.author && typeof star.author === 'object') return star.author.en ?? star.author.zh ?? ''
  return ''
}
export function starOneLiner(star) { return star?.oneLiner ?? star?.summary ?? '' }

export function applyInitialLanguage() {
  applyDocumentLanguage()
}
