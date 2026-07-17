// Five node "branches": four real paper sources + one generated-idea branch.
// Anchors spread the sources into their own region of the galaxy; the idea
// branch sits centrally so grounding edges radiate outward to the papers
// that inspired each idea.
export const BRANCHES = {
  arxiv: {
    label: 'arXiv',
    color: '#7aa2ff',
    anchor: [-820, 40, -260],
    nebula: { scale: 1.4, elong: [0.85, 0.4], stretch: 1.6 }
  },
  huggingface: {
    label: 'HF Daily Papers',
    color: '#ffb84d',
    anchor: [-260, -70, -700],
    nebula: { scale: 1.15, elong: [0.3, -0.9], stretch: 1.4 }
  },
  paperswithcode: {
    label: 'Papers with Code',
    color: '#4de6c8',
    anchor: [640, -30, -420],
    nebula: { scale: 1.2, elong: [0.9, -0.25], stretch: 1.5 }
  },
  twitter: {
    label: 'X / Twitter',
    color: '#6dc7ff',
    anchor: [520, 90, 420],
    nebula: { scale: 1.0, elong: [0.6, 0.7], stretch: 1.3 }
  },
  idea: {
    label: 'Generated Ideas',
    color: '#ff4dd2',
    anchor: [-120, 30, 320],
    nebula: { scale: 1.35, elong: [0.4, 0.85], stretch: 1.45 }
  }
}

export const BRANCH_KEYS = Object.keys(BRANCHES)
