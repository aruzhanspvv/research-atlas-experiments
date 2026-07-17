# Research Idea Atlas

An interactive 3D star-map that visualizes real research papers alongside
LLM-generated research ideas grounded in them — built by extending the
[Physics-atlas](https://physics-atlas-sigma.vercel.app/?style=deepfield)
Three.js star-map engine (vanilla Three.js + Vite, custom GLSL shaders,
UnrealBloom postprocessing) into a generic paper/idea knowledge graph.

## What it does

- **Interactive star map**: papers and generated ideas both render as stars
  in a dark deepfield-style nebula scene. Hover shows a semi-transparent
  info tooltip; click opens a full detail panel; related nodes highlight
  with **animated** flowing-light edges.
- **Novelty score visualization**: every generated idea has a novelty
  score rendered as a **pulsing violet-to-cyan aura ring** around its star
  (size/color/pulse-rate scale with the score) plus a matching radial
  gauge + rationale text in the detail panel — never a plain number.
- **Idea generation**, grounded in two reference papers' methodology
  (ResearchStudio-Idea's evidence-grounded pattern-guided generation, and
  the human-vs-LLM research-taste-gap paper's opportunity-pattern
  awareness):
  - **Topic → ideas**: type a research topic, get 3 new ideas grounded in
    the most-similar existing papers (or a live arXiv search if nothing
    local is close enough).
  - **Paper(s) → ideas**: paste one or more arXiv IDs/URLs/titles, get
    ideas grounded specifically in those papers.
- **Real edge computation**: papers/ideas connect via cosine similarity on
  text embeddings (or keyword-Jaccard similarity if no embedding key is
  configured) — not random links.
- Seeded on first load with **27 real, live-fetched arXiv papers**
  (including the two grounding papers) across 7 topic clusters, so the map
  is populated immediately — it does not replicate the reference site's
  empty-until-interaction idle view.

## Quick start

```bash
npm install
npm run seed          # fetches ~27 real arXiv papers into src/data/nodes.json (safe to re-run)
npm run dev            # starts both the Vite frontend AND the Express API server
```

Open http://localhost:5173 (or whatever port Vite reports if 5173 is busy).

`npm run dev` runs `vite` (frontend, default port 5173) and
`node server/index.mjs` (backend API, port 8787) concurrently. The Vite
dev server proxies `/api/*` to the backend (see `vite.config.js`), so the
frontend never needs to know the backend's port directly.

To run them separately: `npm run dev:client` and `npm run dev:server`.

## Environment variables (server/.env)

Idea generation **requires** a real LLM call — there is no template-based
fallback for generating ideas (only edge/similarity computation may
degrade gracefully without a key). Copy `.env.example` to `server/.env`
and fill in:

```
OPENAI_API_KEY=sk-...          # REQUIRED for idea generation (POST /api/generate)
EMBEDDING_MODEL=text-embedding-3-small   # optional, defaults shown
CHAT_MODEL=gpt-4o-mini                    # optional, defaults shown
PORT=8787                                  # optional, backend port
```

**Without `OPENAI_API_KEY`:**
- `POST /api/generate` (topic/paper-based idea generation) returns a
  `503 NO_LLM_PROVIDER` with a clear message — the UI surfaces this in the
  idea-composer status line rather than hanging or crashing.
- Edge/similarity computation (`/api/reference`, `/api/refresh`,
  `npm run seed`) still works, falling back to keyword-overlap Jaccard
  similarity instead of cosine similarity on embeddings. This is real
  (non-random) similarity signal, just weaker than embeddings.

The provider is pluggable in principle (`server/lib/embeddings.mjs` and
`server/lib/ideation.mjs` isolate all OpenAI-specific calls); swapping to
another provider means editing those two files' `fetch()` calls and
response parsing.

## Architecture

```
src/                     Vite frontend (vanilla JS + Three.js)
  scene/                 Rendering: renderer, camera rig, backgroundStars,
                          discStars, nebulae, nodeStars (papers+ideas +
                          novelty aura shader), edges (grounded-in/similar,
                          animated flow), labels, lensAxis
  interact/hover.js       Hover/focus/lineage state machine
  ui/                     nodeCard.js (detail panel), hoverTooltip.js,
                          searchBox.js, ideaComposer.js (topic/paper-ref input)
  data/                   topics.js (data-driven topic anchors, replaces
                          the old hardcoded branches.js), nodes.json,
                          edges.json, liveSource.js (fetch wrapper)
server/                  Node/Express backend
  index.mjs               Express app, serves /api/*, serves built
                          frontend in production
  routes/                 fetchPapers.mjs (/api/fetch, /api/reference,
                          /api/refresh), generateIdeas.mjs (/api/generate)
  lib/                    ideation.mjs (LLM idea generation, no fallback),
                          novelty.mjs (score + rationale), embeddings.mjs
                          (cosine + Jaccard similarity), edgeCompute.mjs,
                          placement.mjs (runtime node positioning),
                          store.mjs (nodes.json/edges.json read/write),
                          sources/{arxiv,hfDaily,x}.mjs
tools/
  fetchSeed.mjs            Offline seed script (npm run seed) — fetches
                          papers, embeds, computes topics/layout/edges,
                          writes src/data/nodes.json + edges.json.
                          Supersedes the original Physics-atlas
                          tools/layout.mjs + tools/validate.mjs, which
                          were removed (they assumed the old hand-authored
                          physics-star schema and would not run against
                          this project's generic paper/idea schema).
```

### Why a backend server (not client-only)?

- **CORS**: arXiv's API is CORS-friendly, but Papers with Code and
  Hugging Face Daily Papers generally are not, and calling an LLM directly
  from the browser means shipping the API key to every visitor.
- **Embeddings cache**: similarity edges need embeddings computed once and
  persisted, not recomputed client-side every session.
- The same Express server serves the built static frontend in production
  (`NODE_ENV=production node server/index.mjs` after `npm run build`), so
  deployment is a single process.

### Novel-node placement (no full re-layout per generation)

New nodes from live idea generation are placed by anchoring near their
most-similar existing neighbor (or their topic's nebula anchor if none is
close) plus deterministic hash-seeded jitter (`server/lib/placement.mjs`).
This keeps clusters visually coherent without re-running any global
force-directed layout solve on every generation — the offline `npm run
seed` script computes initial positions once (deterministic anchor +
jitter), and live-generated nodes are placed incrementally after that.

### Live scene insertion (no geometry rebuild)

`nodeStars.js` and `edges.js` pre-allocate buffer capacity ~1.6-1.8x the
initial node/edge count. New nodes/edges from live generation are appended
via `addNode()`/`addEdge()`, which write into the spare buffer slots and
bump the WebGL draw range — no full geometry rebuild, so newly generated
ideas fade in smoothly.

## Known limitations / deviations from the original plan

- **Papers with Code is not implemented as a separate source.** Verified
  during development that `paperswithcode.com/api/v1/papers/` now
  permanently redirects (302) to `huggingface.co/papers/trending` — PwC's
  API has been folded into/replaced by the HF Daily Papers integration
  that already ships (`server/lib/sources/hfDaily.mjs`). arXiv (hard
  requirement) and HF Daily Papers (best-effort) are the two working
  sources.
- **X/Twitter is stubbed, not implemented** (`server/lib/sources/x.mjs`):
  X's API is paywalled/rate-limited and out of scope per the contract.
  The stub is enumerated in `/api/refresh`'s pipeline (so the response
  reports which sources were attempted vs. succeeded) but always returns
  `[]`.
- **i18n dropped**: the original Physics-atlas had a full zh/en dual-
  language system (`i18n.js`, language switcher). Per contract, this app
  is English-only; `i18n.js` and the switcher UI were removed entirely.
- **`tourPlayer.js` / guided tours dropped** per contract — not needed for
  this use case.
- **KaTeX/equation rendering and `sims/` (interactive physics demos)
  dropped** — not applicable to a paper/idea graph; removed along with
  `demoStage.js`, `simHost.js`.
- **Similarity threshold tuning**: the Jaccard-fallback similarity
  threshold (`SIMILARITY_THRESHOLD` in `server/lib/edgeCompute.mjs`) is
  empirically tuned to `0.06` against the actual 27-paper seed set's score
  distribution (max ~0.16, median ~0.04) — this may need re-tuning if the
  dataset composition changes significantly (e.g. after `npm run refresh`
  with different topic queries).
- **A separate `tools/computeEdges.mjs` CLI (mentioned in the original
  plan doc) was not created** — its logic (`computeAllSimilarEdges`)
  lives directly in `server/lib/edgeCompute.mjs`, called by both
  `fetchSeed.mjs` and the live generation routes, avoiding duplicate
  similarity logic between the offline and live paths.
- **`tools/layout.mjs` and `tools/validate.mjs` (original Physics-atlas
  scripts) were removed rather than adapted** — they assumed the old
  hand-authored physics-star schema (branches.js anchors, stars.json
  shape) and would not run against this project's generic paper/idea
  schema without a substantial rewrite. `tools/fetchSeed.mjs` supersedes
  their combined role (fetch + layout + edges) for this project.

## Post-evaluation fixes (round 2, after `docs/EVAL_REPORT.md`)

An adversarial evaluation pass (no LLM key available in that session) found
and reported several real bugs, all fixed:

1. **[HIGH] No fetch timeout → indefinite hang.** `server/lib/sources/arxiv.mjs`'s
   `searchArxiv()`/`fetchArxivById()` had no `AbortSignal.timeout()`. An
   invalid arXiv ID (e.g. `9999.99999`) or garbage text input hung the
   request for 15-20s+ with zero feedback (repro'd via
   `curl -m 20 -X POST /api/reference -d '{"input":"9999.99999"}'`).
   **Fix:** added a shared `server/lib/fetchTimeout.mjs` helper
   (`fetchWithTimeout`, 8s default) applied to every outbound `fetch()` —
   `arxiv.mjs`, `hfDaily.mjs` (already had one, kept consistent),
   `ideation.mjs`'s chat-completion call (30s, LLM calls legitimately take
   longer), and `embeddings.mjs`'s embedding call. Timeouts now surface as
   a clean `504 SOURCE_TIMEOUT` in every route's catch block instead of
   hanging. **Verified:** the exact repro now returns in ~0.1-0.4s with a
   clean `404`/error response; separately verified the timeout mechanism
   itself fires correctly against a genuinely slow endpoint
   (`https://httpbin.org/delay/30` with a 1.5s bound → aborted at ~1.5s).
2. **[HIGH] Nebula/bloom rendering degrades after normal UI interaction.**
   Root-caused to two independent mechanisms: (a) `nodeCard.js`'s CSS
   close-transition could be left in a "stuck" state (`getAnimations()`
   showing `playState: "running"` with a frozen `currentTime`) if a new
   open/close was triggered before the previous transition settled — this
   let animations pile up indefinitely rather than being replaced. (b) the
   entire scene's damped visual state (`lensAnim` progress, `hover.js`'s
   `focusDim`) is driven purely by `requestAnimationFrame`, which browsers
   throttle/pause when a tab is backgrounded — if a lens-switch was
   mid-flight at that moment, it had no way to "catch up" once the tab
   regained focus, leaving the nebula visibly dimmed indefinitely.
   **Fix:** added `settleAnimations()` (cancels in-flight animations
   before starting a new open/close/flip transition) to `nodeCard.js` and
   `ideaComposer.js`; added a `document.addEventListener('visibilitychange', ...)`
   recovery hook in `main.js` that drains the idle-time clock delta,
   force-completes any stuck `lensAnim` via `finishLensAnimation()`, and
   forces an immediate `composer.render()` on regaining visibility.
   **Verified:** repeated open/close/toggle cycles now cap animation count
   at exactly 2 (never grow unboundedly) across 10+ cycles; a simulated
   backgrounding-mid-lens-transition scenario recovers full nebula
   rendering immediately after the visibilitychange handler fires.
3. **[MEDIUM] Duplicate reachable "Close" buttons.** `nodeCard.js`'s front
   and back flip-faces both kept their `.card-close` button focusable/
   `aria`-visible simultaneously (the flip is a pure CSS 3D transform,
   backface-hidden only visually). **Fix:** added `inert`/`aria-hidden`
   toggling (`syncFaceInertness()`) so exactly one face's controls are
   reachable at a time, correctly updated on open/close/flip.
   **Verified:** exactly one `.card-close` is reachable (`closest('[inert]') === null`)
   in every state (front shown, back shown, fully closed — both inert).
4. **[LOW] E1 same-topic vs cross-topic edge ratio below the plan's 2x bar.**
   Was ~1.6-1.8x. **Fix:** added a small, legitimate topic-tag-overlap
   boost (real arXiv-category/seed-query metadata, not synthetic) to the
   Jaccard-fallback similarity score in `embeddings.mjs`. **Verified:**
   re-measured against a fresh `npm run seed` run — ratio improved to
   4.67x (56 same-topic vs. 12 cross-topic edges), comfortably clearing
   the bar without inflating the overall score distribution (median
   stayed at 0.044).
5. **Idea-generation pipeline re-verified with a mocked LLM response**
   (same approach as round 1, run through the actual production code path
   this time — `generateIdeas()` → `scoreNovelty()` → `placeNode()` →
   `groundedInEdges()`/`similarEdgesFor()` → written to the real
   `nodes.json`/`edges.json`, then loaded and rendered in a fresh browser
   session, not injected via manual JS). Confirmed the novelty aura ring
   and radial gauge both render correctly for a pipeline-generated idea
   (novelty score 92, "evaluation-critique"/"empirical" tags, full
   grounded-in edge to its source paper visible and labeled).

## Self-testing performed

- Full page load, console-error-free (checked via browser devtools
  console across load → hover → click → generate-error-path → close).
- Hover picking verified against real projected screen coordinates for
  multiple nodes; tooltip and detail-card content verified type-correct
  (paper fields vs. idea fields never mixed).
- Full idea-generation pipeline (ideation → novelty scoring → placement →
  edge creation) verified end-to-end with a mocked LLM response
  (`tools/_testGeneration.mjs`, since run and deleted — not shipped).
- Live scene-insertion API (`nodeStars.addNode`/`edges.addEdge`) verified
  to add exactly one new star + one new edge with no duplication, correct
  aura rendering, and correct detail-card gauge rendering — this caught
  and fixed one real double-registration bug (`hover.js`'s
  `registerNode` was pushing onto an array `main.js` had already pushed
  onto, causing double-entries and wrong index computation). Also found
  that `edges.js`'s edge-endpoint `byId` map was frozen at construction,
  so live-added nodes couldn't be resolved for new edges — fixed by
  adding a `registerNode()` sync hook to `edges.js` as well.
- Server-side edge-case validation tested directly via curl: empty topic
  (`EMPTY_TOPIC`), missing LLM key (`NO_LLM_PROVIDER`), empty reference
  input (`INVALID_INPUT`), already-existing paper reference (`added:false`).
- Jaccard similarity distribution measured empirically against the real
  seed dataset to tune the edge threshold (initial `0.18` threshold
  produced 0 edges; retuned to `0.06`, producing 52 edges across 27 papers
  with visible topic clustering).
- Performance: manual frame-stepping showed ~1ms/frame for the JS update
  loop (hover/lens/label logic) with 27-29 nodes; GPU render cost not
  separately profiled but the additive-blended point/line rendering
  approach is unchanged from the original Physics-atlas, which was
  already tuned for this rendering style.

## Data schema

See `src/data/nodes.json` for live examples. Summary:

```jsonc
// Paper node
{ "id": "paper:arxiv:2607.04439", "type": "paper", "title", "authors": [],
  "source": "arxiv"|"hf-daily", "sourceUrl", "year", "abstract",
  "topics": [], "influence": 1-5, "embedding"?: number[],
  "pos": { "galaxy": [x,y,z], "timeline": [x,y,z], "scale": [x,y,z] } }

// Idea node
{ "id": "idea:...", "type": "idea", "title", "summary", "fullText",
  "generatedFrom": ["paper:..."], "generationMethod": "topic"|"papers",
  "noveltyScore": 0-1, "noveltyRationale", "opportunityPattern",
  "researchParadigm", "differentiation", "topics": [], "createdAt",
  "embedding"?: number[], "pos": {...} }
```

`edges.json`: `{ "from", "to", "type": "grounded-in"|"similar", "weight": 0-1 }`
