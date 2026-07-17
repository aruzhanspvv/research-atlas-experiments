# Research Atlas

An interactive star map of research papers and AI-generated research ideas, built on top of [Physics Star Atlas](https://github.com/Sac-Y/Physics-atlas)'s Three.js engine. Papers and ideas are stars; grounding/inspiration relationships are animated filaments; every idea carries a distinctive novelty-score visualization (a pulsing halo ring in the scene, a radial gauge + 3-axis breakdown in the detail panel).

Live style: `?style=deepfield` (default) or `?style=interstellar`.

## Pipeline

1. **Fetch** — `npm run research -- "topic"` pulls real, current papers from the public arXiv API (no key required) into `src/data/papers.raw.json`.
2. **Build** — a "builder" worker (Sonnet 5, browser-enabled) reads the fetched papers and drafts evidence-grounded research ideas into `src/data/ideas.raw.json`, each citing which papers ground it and self-labeling a risk level (incremental / ambitious / high-risk).
3. **Evaluate** — an "evaluator" worker (Sonnet 5, browser-enabled) independently searches the live literature to check each idea against existing work, then scores it on novelty / feasibility / excitement with a written rationale, into `src/data/eval.raw.json`.
4. **Layout** — `npm run layout` merges all three into the final `src/data/{papers,ideas,edges}.json`, scattering papers around their source's nebula and pulling each idea toward the centroid of the papers that ground it.
5. **View** — `npm run dev`.

Steps 2–3 are agent runs (not scriptable without wiring an LLM API key into a server), so the "Generate ideas" panel in the UI queues the request and documents the exact commands to run — it doesn't fake a live backend.

## Structure

```
src/
  scene/    nebulae / nodes (papers+ideas, novelty-ring shader) / edges (grounding & inspiration filaments) / labels / camera / renderer
  ui/       node detail card (novelty gauge) / search+generate / generate panel
  data/     sources.js (5 branches: arxiv, huggingface, paperswithcode, twitter, idea) + papers/ideas/edges JSON
tools/      fetch-arxiv.mjs (real API pull) · layout.mjs (merge + galaxy coordinates)
```
