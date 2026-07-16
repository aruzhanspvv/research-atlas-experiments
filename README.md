# Research Atlas — Tool Comparison

Same brief, built with different coding tools/agents, kept side by side in this
repo for comparison. The brief: fork the [Physics Star Atlas](https://github.com/Sac-Y/Physics-atlas)
interactive star-map engine into a site that surfaces new research ideas —
grounded in real papers (arXiv, HF Daily Papers) — and visualizes each idea's
novelty score and its evidence links back to prior work.

## Iterations

| Folder | Tool | Notes |
| --- | --- | --- |
| [`claude-code/`](./claude-code) | Claude Code | Offline data pipeline (curated papers + authored ideas) + Three.js star map, "Generate Idea" client-side grounding engine. |

Each folder is a fully self-contained project (its own `package.json`,
`README.md`, install/build/dev instructions). Add new iterations as sibling
folders — they don't need to share dependencies or structure.

## Running any iteration locally

```bash
cd <folder-name>
npm install
npm run dev
```
