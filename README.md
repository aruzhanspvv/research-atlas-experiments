# Research Atlas — Tool Comparison

Same brief, built with different coding tools/agents, kept side by side in this
repo for comparison. The brief: fork the [Physics Star Atlas](https://github.com/Sac-Y/Physics-atlas)
interactive star-map engine into a site that surfaces new research ideas —
grounded in real papers (arXiv, HF Daily Papers) — and visualizes each idea's
novelty score and its evidence links back to prior work.

## Iterations

| Folder | Tool | Notes |
| --- | --- | --- |
| [`claude-code/`](./claude-code) | Claude Code (default agent) | Offline data pipeline (curated papers + authored ideas) + Three.js star map, "Generate Idea" client-side grounding engine. |
| [`claude-code-goal/`](./claude-code-goal) | Claude Code `/goal` | Separate builder/evaluator pipeline stages (fetch → draft ideas → independently score against live literature → layout), novelty shown as both an in-scene pulsing halo ring and a 3-axis gauge in the detail card. |
| [`adal-engineer-test-sonnet5/`](./adal-engineer-test-sonnet5) | Adal engineer test run (all workers on Sonnet 5) | The only iteration with a real backend: Express API server + live LLM calls for ideation (requires an API key in `server/.env`, see that folder's README), cosine-similarity edges over text embeddings, live topic/paper → idea generation. |

Each folder is a fully self-contained project (its own `package.json`,
`README.md`, install/build/dev instructions). Add new iterations as sibling
folders — they don't need to share dependencies or structure.

Note: `claude-code/` and `claude-code-goal/` are fully static (no backend,
data baked in at build time); `adal-engineer-test-sonnet5/` needs its Express
server running (and an LLM API key) for idea generation to work live.

## Running any iteration locally

```bash
cd <folder-name>
npm install
npm run dev
```
