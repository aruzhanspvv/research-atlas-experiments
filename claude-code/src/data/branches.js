// Seven research-topic branches. Anchors spread diagonally through the galaxy
// (pattern kept from the physics-atlas fork this project builds on);
// tools/layout.mjs reads these same anchors, so this file is the single source of truth.
export const BRANCHES = {
  'llm-agents': {
    en: 'LLM Agents & Harnesses',
    color: '#5ad1ff',
    anchor: [-1000, 40, -300],
    nebula: { scale: 1.4, elong: [0.85, 0.4], stretch: 1.6 }
  },
  'reasoning-alignment': {
    en: 'Reasoning & Alignment',
    color: '#ff6ad5',
    anchor: [-560, -20, -700],
    nebula: { scale: 1.2, elong: [0.3, -0.9], stretch: 1.5 }
  },
  'generative-vision': {
    en: 'Generative & Vision Models',
    color: '#ffb648',
    anchor: [-120, 80, 220],
    nebula: { scale: 1.55, elong: [0.6, 0.6], stretch: 1.35 }
  },
  'embodied-robotics': {
    en: 'Embodied AI & Robotics',
    color: '#7cff6b',
    anchor: [300, -60, -450],
    nebula: { scale: 1.3, elong: [0.9, -0.25], stretch: 1.7 }
  },
  'multimodal-foundation': {
    en: 'Multimodal Foundation Models',
    color: '#b98bff',
    anchor: [640, 30, 300],
    nebula: { scale: 1.35, elong: [0.5, 0.85], stretch: 1.5 }
  },
  'learning-theory-optim': {
    en: 'Learning Theory & Optimization',
    color: '#4de6d9',
    anchor: [1000, -30, -100],
    nebula: { scale: 1.15, elong: [0.4, -0.95], stretch: 1.6 }
  },
  'neuro-inspired-computing': {
    en: 'Neuro-Inspired & Artificial Life',
    color: '#ff7a4d',
    anchor: [1320, 60, -560],
    nebula: { scale: 1.25, elong: [0.65, 0.7], stretch: 1.4 }
  }
}

export const BRANCH_KEYS = Object.keys(BRANCHES)
