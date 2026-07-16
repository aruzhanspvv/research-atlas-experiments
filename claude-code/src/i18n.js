// Static UI copy. Single language (English) — the physics-atlas fork this project
// started from supported zh/en; this app drops that axis to focus effort on the
// research-idea domain model instead.
export const TEXT = {
  app: {
    title: 'Research Atlas',
    subtitle: 'Papers & Generated Ideas · Interactive Star Map',
    documentTitle: 'Research Atlas',
    branchLegend: 'Field legend',
    styleSwitcher: 'Visual style',
    lensSwitcher: 'Lens',
    hint: 'DRAG TO ORBIT  ·  SCROLL TO ZOOM',
    resetView: 'Reset view'
  },
  lens: {
    galaxy: 'Galaxy',
    timeline: 'Timeline',
    novelty: 'Novelty'
  },
  axis: {
    timelineTitle: 'Publication date →',
    noveltyTitle: 'Novelty · existing work → frontier idea',
    existing: 'existing work',
    incremental: 'incremental',
    notable: 'notable',
    novel: 'novel',
    breakthrough: 'breakthrough',
    frontier: 'frontier'
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
    paperTag: 'PAPER',
    ideaTag: 'GENERATED IDEA',
    readPaper: 'Read on arXiv ⤢',
    groundedIn: 'Grounded in',
    relatedIdeas: 'Ideas grounded here',
    gap: 'Gap addressed',
    differentiation: 'How this differs from prior art',
    method: 'Method sketch',
    priorArt: 'Prior-art check',
    novelty: 'Novelty score',
    empty: '—'
  },
  generate: {
    label: 'Generate idea',
    placeholder: 'Enter a topic, or paste a paper title/abstract…',
    button: 'Generate',
    working: 'Grounding against the corpus…',
    empty: 'Type a topic or paste an abstract first.',
    close: 'Dismiss'
  }
}

export function t(path) {
  return path.split('.').reduce((acc, part) => acc?.[part], TEXT) ?? path
}

export function branchName(key, BRANCHES) {
  return BRANCHES[key]?.en ?? key
}

export function presetLabel(key) {
  return t(`preset.${key}`)
}
