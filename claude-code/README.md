# Research Atlas

Papers and AI-generated research ideas, mapped as an interactive star galaxy.
Forked from [Sac-Y/Physics-atlas](https://github.com/Sac-Y/Physics-atlas)'s
Three.js star-map engine, retargeted from physics history to a live research
corpus: **arXiv** + **Hugging Face Daily Papers** feed an offline pipeline that
curates papers into topic clusters and grounds a set of AI-generated research
ideas against them — each idea carries a novelty score, a stated gap, a method
sketch, and edges back to the papers it's grounded in.

## Features

- **Galaxy of 84 stars + 141 background papers**, clustered into 7 research
  fields (LLM Agents, Reasoning & Alignment, Generative & Vision, Embodied
  Robotics, Multimodal Foundation Models, Learning Theory & Optimization,
  Neuro-Inspired Computing), each its own colored nebula.
- **Three lenses**: Galaxy (topic clusters) / Timeline (by publication date) /
  Novelty (papers cluster at "existing work", generated ideas fan out toward
  "frontier" by score).
- **Detail cards**: click a star for a paper's metadata + arXiv link, or an
  idea's hypothesis, gap addressed, method sketch, differentiation from prior
  art, and a radial novelty-score gauge.
- **Evidence graph**: animated derivation edges connect every generated idea
  to the real papers it's grounded in; flip the card to see the full list.
- **Generate Idea (client-side, no API key)**: type a topic or paste an
  abstract; a TF-IDF-style ranking over the fetched paper corpus surfaces the
  closest precedents and synthesizes a new grounded idea + novelty score,
  added live to the scene.
- Two visual presets carried over from the physics-atlas fork: **Deep Field**
  and **Interstellar**.

## Data pipeline (offline, re-run to refresh)

```bash
node data-pipeline/fetchPapers.mjs   # pulls latest papers -> data-pipeline/raw/papers.json
node data-pipeline/build.mjs         # curates + assembles src/data/{stars,edges,dust}.json
node tools/layout.mjs                # force-layout: fills in pos.{galaxy,timeline,novelty}
```

The paper selections and the 14 baseline research ideas in `build.mjs` were
authored by hand (grounded in the real fetched abstracts) — no LLM API key is
used in this pipeline. The in-app "Generate Idea" feature is a separate,
purely client-side heuristic (see `src/interact/ideaGenerator.js`).

## Local development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build to dist/
```

## Project structure

```
data-pipeline/   fetchPapers.mjs (arXiv + HF Daily Papers) · build.mjs (curation + assembly)
src/
  scene/         star-map rendering: nebulae / instanced stars / edges / labels / camera / lens axes
  ui/            detail card / search / generate-idea panel
  interact/      hover-focus state machine · client-side idea generator
  data/          stars / edges / dust (static JSON, generated) + branch definitions
tools/           layout.mjs (offline force-layout) · validate.mjs (data validation)
```
