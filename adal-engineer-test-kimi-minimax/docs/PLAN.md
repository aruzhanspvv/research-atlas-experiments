# Physics → Research-Idea Atlas — Phase 1 Plan

> **Status:** investigation + design. **No application code written yet.**
> **Baseline captured:** dev server running at `http://127.0.0.1:5183/?style=deepfield&lang=en` — deepfield style, nebulae by branch, six labelled high-tier stars visible, lineage arcs rendering. Console clean.

---

## 1. Goal, in one paragraph

Re-skin the existing Physics Star Atlas to be a **Research Idea Atlas**: every node is either a *paper* (arXiv-derived) or a *generated idea* (LLM-derived). Two node classes are visually distinct. Hover lights up the lineage; click opens a detail panel; every idea carries a *novelty score* with a distinctive per-star visual treatment. The ideation methodology is grounded in two real arXiv papers — both verified live to exist on arXiv (see §6).

---

## 2. What changes about the data

The schema must extend, not replace. Every existing field on `src/data/stars.json` / `src/data/edges.json` stays valid; new fields are optional and default sensibly.

### 2.1 Extended star record (additive)

```jsonc
{
  // — existing fields (kept) —
  "id": "kepler-laws",
  "name": { "zh": "...", "en": "..." },
  "year": 1609, "branch": "mechanics", "influence": 3, "frontier": false,
  "pos": { "galaxy": [..], "timeline": [..], "scale": [..] },

  // — new, optional —
  "kind": "paper",                       // "paper" | "idea"  (default: "paper")
  "abstract": "…",                       // paper abstract or idea proposal text
  "authors": ["Kepler"],                 // string[] (papers) or ["AdaL · LLM"] (ideas)
  "venue": "Astronomia Nova",            // paper venue or "Generated"
  "sourceUrl": "https://arxiv.org/abs/…",// papers: arXiv abs page; ideas: optional
  "arxivId": "1609.12345",               // present iff ingested from arXiv
  "noveltyScore": null,                  // 0–100, ideas only; null on papers
  "generatedFrom": [],                   // idea-only: paper ids it was grounded in
  "evidence": [                          // idea-only: short snippets + their source ids
    { "quote": "…", "from": "paper-id-1" }
  ],
  "ideationPattern": null                // idea-only: one of the 15 patterns (e.g. "bridge-synthesis")
}
```

Render-layer assumptions:
- `kind === "paper"` → use the existing influence/branch color/size pipeline exactly as today.
- `kind === "idea"` → branch defaults to the most-common branch of its `generatedFrom`; influence defaults to `2`; size smaller; **a dedicated fragment-shader branch paints the novelty visualization** (see §4).

### 2.2 Extended edge record (additive)

```jsonc
{
  "from": "paper-id-1",
  "to":   "idea-id-7",
  "type": "derivation",   // "derivation" | "inspiration" | "grounding" (new)
  "weight": 0.8           // 0..1; affects edge brightness/width
}
```

New type `"grounding"` lights up paper↔idea connections in a **third, visually distinct** line style (slow-flowing, low-saturation teal) so users can read the graph as "this idea was generated from these papers."

### 2.3 New top-level file `src/data/seed-papers.json`

A hand-curated **list of 25 real arXiv ids** to populate the default map. Selection rules:
- One per era (pre-2000 → 2024) so the timeline lens looks populated.
- Distributed across all six branches (mechanics/em/thermo/relativity/quantum/cosmology + a couple of cross-cutting ML/optimization).
- Each paper fetched once via arXiv API at install time (script in §3) and cached into `seed-papers.json` as already-structured star records. The dev experience is: `npm install` → fetch happens → `seed-papers.json` populated → dev server boots with stars already there.

The **map stays populated even with no LLM key** — that's the hard requirement. Ideas are an additive layer on top.

---

## 3. Architecture decision — where paper fetch + idea generation live

**Decision: client-side, with one thin abstraction module.**

- **arXiv ingest:** browser fetch to `http://export.arxiv.org/api/query?…` (CORS-open, no key). Wrapper: `src/lib/arxiv.js` exposing `searchPapers(query)`, `fetchPaper(id)`, `paperToStar(arxivEntry)`.
- **LLM generation:** browser fetch via `src/lib/llm.js` to an OpenAI-compatible chat-completions endpoint (`/v1/chat/completions`). Single env-injected config object read at build time via Vite's `define`:
  ```js
  // vite.config.js — read from .env.local (gitignored) and expose via import.meta.env
  VITE_LLM_BASE_URL, VITE_LLM_API_KEY, VITE_LLM_MODEL
  ```
  If any is missing, `llm.js` exports `{ ready: false, reason: '...' }`; the UI shows a clear inline message ("Add `VITE_LLM_API_KEY` to `.env.local` to enable idea generation") and **disables the Ideate button — no crash**.

**Why client-side, not a tiny server:**
1. Matches the project's existing shape (zero backend today; `tools/layout.mjs` is the only build-time script).
2. Keeps the repo one-process (`npm run dev`) — fewer surprises, faster iteration, no separate deploy story.
3. The LLM key sits behind **one module with a pluggable key**; the contract is identical to a future server proxy if you ever want to swap.

**Tradeoff (acknowledged):** the key is shipped to the browser. For a personal/portfolio project this is fine; if you ever care about sharing the deployed URL publicly, you'd proxy through a server later. README will note this explicitly.

**Stretch sources (best-effort, degrade gracefully):**
- **Papers with Code** — public API, no key; used to enrich seed papers with `codeUrl` / `tasks`. Failures swallowed, field stays null.
- **Hugging Face Daily Papers** — `https://huggingface.co/api/daily_papers` (no key). Used as an alternative corpus. Failures swallowed.
- **X/Twitter** — **not feasible without paid API access**. README will say: *"X ingestion requires a bearer token; left as a TODO — plug-in slot exists in `src/lib/sources/x.js` but is dormant by default."*

**Single module entry: `src/lib/ideate.js`** orchestrates everything:
```
ideate({ topic?, papers?, mode }) →
   1. assemble evidence bundle  (fetch/expand arXiv abstracts)
   2. build prompt (15-pattern catalog inline, 2-axis taste reminder)
   3. stream LLM response → parse JSON → score novelty
   4. return { idea, edges, groundings } ready to insert
```

---

## 4. Novelty score — concrete formula + distinctive visualization

### 4.1 Formula (works without embeddings)

Inspired by the two reference papers (see §6): **distance from grounding papers** (the ResearchStudio-Idea "collision check") **× evidence coverage** (the ResearchStudio-Idea "evidence-readiness") **× gap-awareness** (Chen et al.'s observation that LLMs cluster on bridge-like opportunities → reward *non-bridge* opportunities and *non-synthesis* paradigms).

```
novelty ∈ [0, 100]

  d       = mean Jaccard distance between idea's keyword set and
            each grounding paper's keyword set (top-K=20 keywords each,
            stopwords removed, TF over abstract)
            → 0 (identical) to 1 (disjoint)

  cov     = 1 − exp(-E / 5)   where E = |idea.evidence| (capped at 10)
            → smooth saturating curve; 5 supporting quotes ≈ 0.63

  opport  = opportunity-pattern novelty bonus
            bridge→0.4, gap→0.7, limit→0.85, reframing→1.0
            (penalty when LLM over-uses "bridge", per Chen et al.)

  parad   = paradigm novelty bonus
            synthesis→0.5, extension→0.7, novel-mechanism→1.0, new-domain→0.95

  novelty = round( 100 * (0.50 * d + 0.20 * (1 − exp(-E/5))
                          + 0.15 * opport + 0.15 * parad) )
            clamped to [0, 100]
```

The two bonuses come from the LLM output — the prompt *asks* it to self-classify into the 2-axis taste taxonomy from Chen et al. (opportunity pattern × research paradigm), and to emit one of the 15 ResearchStudio-Idea patterns. We map its answer → bonus weight.

The distance term is **0.50 weight** — by far the largest. That mirrors the "novelty ≈ gap from prior work" definition used by both reference papers.

### 4.2 Visualization on the star itself — **option B (chosen)**

The idea node is **a small dot inside a thin orbital ring**, where:
- **Inner dot** = always-on idea core (branch color, 0.7× paper-star size)
- **Outer ring radius** = novelty (small ring ≈ novel, big ring ≈ well-trodden) — *inverted* so "small ring = far from everything" reads as "this is new"
- **Ring stroke dash density** = evidence coverage (more dashed segments = more evidence quotes)
- **Ring color** = opportunity-pattern (4 distinct hues: bridge=warm, gap=cool, limit=violet, reframing=gold)
- **A subtle pulse** = paradigm (synthesis=steady, extension=slow, novel-mechanism=double-pulse, new-domain=fast irregular)

Why option B over a heat-map gradient: the **distinctiveness** requirement maps cleanly onto shape (ring) + radius (novelty) + dash (evidence) + hue (opportunity) + rhythm (paradigm) — five orthogonal visual channels, all readable on a 2–3 px sprite even at full galaxy zoom. A pure color gradient would just make every idea a slightly bluer/oranger star and fail the "distinctive visual treatment" test.

The panel value (e.g. **Novelty 78**) is also rendered with a tiny **circular gauge** (SVG, not canvas) using the same color palette — keeps the ring-on-star ↔ ring-in-panel visually unified.

---

## 5. Live insertion without scene rebuild

The existing renderer pre-allocates one `BufferGeometry` per layer (stars, edges, labels). Full rebuilds are expensive. The pattern used for **lens transitions** (`beginLens` → animated `posTo` → `commitLens`) is exactly the right tool — copy it.

### 5.1 Headroom

Stars layer: pre-allocate `MAX_STARS = 4096` (current ~160, future 25 papers + ~50 ideas × re-runs = headroom 50×).
Edges layer: pre-allocate `MAX_EDGES = 8192`. Current ~300 in `edges.json` — headroom 27×.
Labels: CSS2D, each label is a DOM node — cheap to add (skip layout when `obj.visible=false`, already proven in `labels.js`).

Reallocation policy: when a `addIdea/removeIdea` call pushes the live count above 75% of `MAX_STARS`, log a console warning and surface a small UI toast ("Approaching node cap; oldest 10 ideas will be pruned."). At 90%, auto-prune. No silent failures.

### 5.2 Deterministic placement (no overlap)

New idea placement rule, evaluated in this order:
1. **Anchor** = centroid of `generatedFrom` papers' world positions.
2. **Offset** = spherical random at fixed-radius 220 units (mulberry32 keyed by `idea.id` → reproducible).
3. **Relaxation step** = N=12 iterations of soft-push against any star within 90 units (same algorithm as `tools/layout.mjs` lines 100–118, but local to the new star only — no global rebuild). Lightweight: O(neighbors), runs in <2 ms.
4. **Branch lane assignment** = branch lane center (Z in `timeline` lens, `scaleExp` in `scale` lens) is computed from the dominant branch of `generatedFrom` — so new ideas land in the right swimlane.

For `timeline` and `scale` lenses, `pos.timeline` / `pos.scale` are derived from `year`/`scaleExp` defaults (current year, current scale band); the relaxation runs in those lenses too. The idea's `pos.galaxy` is the live one the user sees.

### 5.3 Edge insertion

`createLineage` already supports `setFocus`/`setFocusIds` writing into pre-allocated `aHi`. We extend with **`addEdge(edge) / removeEdge(edgeId)`** that:
- Writes positions into the next free vertex slot in the pre-allocated buffer.
- Bumps `edgeMeta.push(...)`.
- Sets `geometry.attributes.position.needsUpdate = true`.
- Edge types: `derivation` / `inspiration` (existing) + `grounding` (new — teal slow-flow).

No scene rebuild, no layout tool re-run.

---

## 6. Methodology grounding (the two arXiv references)

I verified both arXiv IDs via the live API and HTML page (HTTP 200 + title match). They're real papers, both dated July 2026:

| ID | Title | Key concepts used in this plan |
|----|-------|-------------------------------|
| **arXiv:2607.04439** | *ResearchStudio-Idea: An Evidence-Grounded Research-Ideation Skill Suite from ML Conference Outcomes* — Zhao et al., 2026/07/05 | **Paper-Search**, **Scoop-Check** (novelty via prior-art collision), **IdeaSpark** (15 reusable ideation patterns → 31 sub-patterns), evidence-readiness check, audit step. |
| **arXiv:2607.01233** | *Measuring the Gap Between Human and LLM Research Ideas* — Chen, Zhao, Cohan, 2026/07/01 | Two-axis **opportunity pattern × research paradigm** taste taxonomy. Finding: LLM ideas over-cluster on **bridge-like opportunities** and **synthesis methods**. → novelty score penalizes bridge + synthesis to surface non-LLM-taste ideas. |

Both are real; I will cite them in the in-app "About this methodology" panel and in the README.

---

## 7. What happens to the existing physics-history content

**Recommendation: keep the deepfield style + branch legend + lens system + card layout; replace the *content* layer (stars + edges + tours + sims) with papers + ideas.**

Specifically:
- **Keep:** `renderer.js`, `cameraRig.js`, `backgroundStars.js`, `discStars.js`, `nebulae.js`, `lensAxis.js`, all HUD chrome, the `deepfield` preset, branch-color logic, lens-switch logic, search-box UI (relabel from "laws · people" → "papers · ideas"), star-card layout (relabel fields), the **deepfield visual language** (James Webb palette).
- **Replace:** `stars.json` content → keep physics stars as a *background set* OR remove. **Recommendation: remove**, since the project is now a *research* atlas, not a physics-history one. Replace with `seed-papers.json` (arXiv).
- **Remove (out of scope):** `src/sims/*` (10 simulation modules, ~30 KB), `src/ui/tourPlayer.js`, `src/data/routes.json` (three tours), all Chinese strings from `src/i18n.js` for removed content. **English-only is fine** — explicitly mentioned by the user as acceptable.
- **Keep:** `tools/layout.mjs` (now used only by an *optional* `npm run layout` rebuild step for the seed papers; live idea placement runs in-browser as described in §5.2).
- **i18n:** strip `zh` from `TEXT`, keep `en` only. Halves `src/i18n.js` size.

This is the simplest path: the *engine* stays; the *content* is swapped.

---

## 8. File-by-file change list

### Add (new files)
| Path | Purpose |
|------|---------|
| `src/data/seed-papers.json` | 25 cached arXiv paper star-records (build-time) |
| `src/data/ideation-patterns.json` | The 15 ResearchStudio-Idea patterns (catalog + 2-axis taxonomy) |
| `src/lib/arxiv.js` | arXiv API wrapper (CORS-friendly) |
| `src/lib/llm.js` | LLM client behind a single `IDEATE_CONFIG` |
| `src/lib/ideate.js` | Orchestrator: paper ingest → prompt → LLM → novelty score → edges |
| `src/lib/novelty.js` | The §4.1 formula + 0–100 score + sub-component breakdown |
| `src/scene/ideaStars.js` | Second `Points` layer for idea-nodes (separate from theoryStars, has the ring shader) |
| `src/scene/ideaEdges.js` | Subset of `lineage`-style edges for grounding type + paper↔idea |
| `src/ui/ideatePanel.js` | Input panel: topic / paper-arxiv-id / "fetch latest" mode |
| `src/ui/ideaCard.js` | Variant of `starCard` for idea-nodes (with novelty gauge + evidence list) |
| `src/ui/noveltyGauge.js` | SVG radial gauge, shared by ideaCard and panel |
| `src/ui/apiKeyBanner.js` | Top-of-screen inline banner when `VITE_LLM_API_KEY` missing |
| `scripts/fetch-seed-papers.mjs` | Build-time script: arXiv → `seed-papers.json` (runs as `postinstall`) |
| `.env.local.example` | Documents `VITE_LLM_BASE_URL` / `VITE_LLM_API_KEY` / `VITE_LLM_MODEL` |
| `docs/METHODOLOGY.md` | Plain-English writeup of the novelty formula + citations |

### Modify
| Path | Change |
|------|--------|
| `index.html` | Remove sim/tour-related CSS; add API-key banner slot; rename search placeholder |
| `src/main.js` | Compose `ideaStars`, `ideaEdges`, `ideatePanel`, `ideaCard`, `apiKeyBanner`; wire click → new card; wire hover → cross-layer highlighting |
| `src/scene/stars.js` | Add `MAX_STARS` headroom, `addStar/removeStar/getStar` API; shader gets a `aIsIdea` branch (no ring yet — that's ideaStars' job) |
| `src/scene/edges.js` | Add `MAX_EDGES` headroom, `addEdge/removeEdge` API; add `aType === grounding` (slow-flow teal) |
| `src/scene/labels.js` | Add label tier `'idea'` (smaller font, lighter) |
| `src/scene/renderer.js` | No change |
| `src/interact/hover.js` | Pick across **both** `theoryStars` and `ideaStars`; cross-highlight when idea ↔ paper |
| `src/ui/starCard.js` | Render new optional fields (abstract, authors, venue, sourceUrl) when present; idea path uses `ideaCard.js` instead |
| `src/ui/searchBox.js` | Search across both papers and ideas; show kind badge |
| `src/style/presets.js` | Rename `interstellar` → keep; add an optional `paper-archive` preset (pure dark archival look) |
| `src/i18n.js` | Strip Chinese; English-only |
| `src/data/branches.js` | Add `ideas` pseudo-branch entry (or just use the dominant paper branch) |
| `tools/layout.mjs` | Optional rebuild script for `seed-papers.json` only |
| `vite.config.js` | Add `define` for the three `VITE_LLM_*` vars; expose `import.meta.env` |
| `package.json` | Add `postinstall: "node scripts/fetch-seed-papers.mjs"`, `ideate:dev` helper |
| `README.md`, `README.en.md` | New "What this is" / "How ideation works" / "API key setup" sections |

### Remove
| Path | Reason |
|------|--------|
| `src/sims/*` (10 files) | Out of scope; simulations were physics-specific |
| `src/ui/tourPlayer.js` | No tours needed |
| `src/data/routes.json` | Tour routes, no longer applicable |
| Tour-related CSS in `index.html` | Same |

---

## 9. Done-criteria & build validation

I will run, in order, and report pass/fail per step:

1. **Build:** `npm run build` exits 0; `dist/` contains `index.html` + hashed JS/CSS.
2. **Dev server:** `npm run dev` boots cleanly on `5183`; no console errors in headless browser.
3. **Static checks:**
   - `node -e "import('./src/data/seed-papers.json')"` → ≥ 25 valid star records.
   - `node -e "import('./src/data/edges.json')"` → valid array.
   - `node -e "import('./src/lib/novelty.js')"` → importable (catches syntax errors).
4. **Browser smoke (Playwright headless):**
   - Page load → `window.__atlas.hover` exists; no JS errors in `console`.
   - Node counts: `theoryStars` ≥ 25, `ideaStars` = 0 initially.
   - After triggering ideation via `window.__atlas.ideate({ topic: "graph neural networks for molecular property prediction" })` (with mock LLM response): `ideaStars` ≥ 1, `ideaEdges` ≥ 1, all idea nodes have `noveltyScore` in [0, 100].
   - Hover an idea → corresponding paper-stars highlighted (visual confirmed via screenshot diff or class-list assertion).
   - Click an idea → `ideaCard` opens with novelty gauge + abstract + evidence + `generatedFrom` list.
   - API-key-missing case: setting `delete window.__LLM_KEY; reload` → banner shown, Ideate button disabled, no crashes.
5. **Accessibility / quality:**
   - No z-index traps; search "/" shortcut still works; ESC closes cards; reset view still works.
   - `lighthouse --only-categories=performance,accessibility` ≥ 85 on dev build.
6. **Visual evidence:** two screenshots saved to `docs/`:
   - `docs/screenshot-initial.png` — deepfield + 25 paper-stars + zero ideas (baseline populated)
   - `docs/screenshot-with-ideas.png` — same view after generating 3 ideas (idea-rings + grounding edges visible)

---

## 10. Risks / assumptions / open questions

### Assumptions
- **arXiv CORS works for `export.arxiv.org/api/query`** — confirmed by other public demos but I will smoke-test on day 1 of build.
- **One LLM provider is enough.** I'm wiring an OpenAI-compatible chat endpoint. If you use Anthropic or a local Ollama, the URL+body swap should be trivial.
- **20–30 seed papers is the right initial density.** Below ~20 the map looks empty on the galaxy lens; above ~30 the labeling gets crowded. If you want a different default, say so.
- **English-only is acceptable** (you stated it is). I will NOT preserve Chinese strings.
- **The physics-history content (stars, edges, tours, sims) is replaced, not retained as a background layer.** It is much cleaner; happy to flip if you want it preserved.

### Risks
- **LLM latency** — chat-completions calls take 4–15 s. The Ideate button must show a spinner and disable; we stream tokens if the endpoint supports `stream: true`.
- **LLM JSON validity** — even strong models occasionally return prose instead of JSON. I'll add a single retry with a stronger prompt before falling back to a "raw response" card.
- **arXiv rate-limiting** — `export.arxiv.org` asks for ~3 s between requests; the seed-fetch script respects this.
- **Browser buffer growth** — even with `MAX_STARS=4096` headroom, repeated ideation could grow close to it; auto-prune (§5.1) is the safety net.
- **Reference papers' methodology is summarized from titles/abstracts only** — full PDFs are not in scope. The formula in §4.1 captures the headline mechanics (collision + evidence + taste gap); if you've read the PDFs and want a stricter interpretation, I'll adjust.

### Open questions for you
1. **LLM provider?** OpenAI / Anthropic / OpenRouter / local Ollama — pick one default, and I'll wire it.
2. **Seed paper list curation.** Do you want me to (a) hand-pick the 25 ids from a domain you care about, (b) let me choose across all six physics branches, or (c) hand me a list?
3. **Scope of "papers from sources" (Papers with Code / HF Daily / X).** The user prompt says best-effort stretch — I'd like to **explicitly scope it to: arXiv (full), HF Daily (corpus only, no enrichment), and X (dormant stub)**. Confirm or override.
4. **Physics-history content — keep or remove?** My recommendation is remove (see §7). If you want it as a background layer (visible only when "show history" toggle is on), say so.
5. **Deployment target?** Just local (`npm run dev`) or do you want a static `dist/` build deployable to Vercel? Affects whether I document the LLM-key-in-browser caveat.
6. **Novelty visualization — option B (orbital ring) confirmed, or want me to mock option A (gradient halo) for comparison?**

---

## 11. Decisions waiting on your approval (the contract)

Before I write any application code, please confirm or amend:
- **A.** Two node classes (paper + idea), idea-stars use the **orbital-ring** novelty visualization.
- **B.** Client-side arXiv + LLM, single key behind `src/lib/llm.js`, missing key → banner + disabled button.
- **C.** arXiv is the *hard* paper source; HF Daily is corpus-only best-effort; X is a dormant stub.
- **D.** Physics-history content (stars, edges, tours, sims) is **removed**; English-only.
- **E.** Novelty formula: `0.50·d + 0.20·(1−e^{−E/5}) + 0.15·opport + 0.15·parad`, where `d` = mean Jaccard distance to grounding papers, `E` = evidence count, `opport` and `parad` come from the LLM's self-classification into Chen et al.'s 2-axis taxonomy.
- **F.** Live insertion: pre-allocated buffers (MAX_STARS=4096, MAX_EDGES=8192), headroom warnings at 75%, auto-prune at 90%. No scene rebuild.
