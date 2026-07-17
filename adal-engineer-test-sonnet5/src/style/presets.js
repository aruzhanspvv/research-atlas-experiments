// Deepfield-only style preset (the "interstellar" alt-preset and the
// style-switcher UI were dropped per contract — English-only, single
// visual identity matching the reference: https://physics-atlas-sigma.vercel.app/?style=deepfield).
export const PRESETS = {
  deepfield: {
    label: 'Deepfield',
    background: '#050308',
    exposure: 1.02,
    bloom: { strength: 0.72, radius: 0.85, threshold: 0.12 },
    nebula: {
      intensity: 1.0,
      saturation: 0.82,
      dustTint: '#c98a4b',
      dustAmount: 0.38,
      coreGlow: 0.55
    },
    stars: { spike: 0.85, halo: 1.0, coreHeat: 0.75 },
    backdrop: { density: 1.0, warmth: 0.6, band: 0.85 }
  }
}

export const DEFAULT_PRESET = 'deepfield'
