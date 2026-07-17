# Research-Idea Star Atlas — Evaluation Plan (Phase 1)

> **TL;DR.** The current repo is the *Physics Star Atlas* (162 curated theory stars, 331 lineage edges, 6 branch nebulae). The builder's job is to graft on **AI-generated ideas** as a *visually distinct* second node class: ideas must read as different at a glance from a screenshot, carry a **0–100 novelty score with a distinctive on-star visualization**, and be reachable through three separate generation entry points. The existing star field, hover/click panels, edge animation, deepfield style, and data pipelines must keep working. This document defines the trap.

---

## 1. What the builder must change / add

### New node class: **AI-generated ideas**
- Distinct visual treatment on the star sprite (additive shader, branch-coloured halo already in use — paper-stars use a *white-hot core + col­oured halo + diffraction spikes*). Ideas must add at least **one** additional, immediately-glanceable cue (see §3 acceptance #3).
- New fields per idea: `kind: "idea"`, `novelty: 0..100` (number), `summary: string`, `groundingPapers: string[]` (refs into the existing `stars.json` ids).
- Stored in a **new** file (`src/data/ideas.json` is the natural place), or appended to `stars.json` behind a `kind` discriminator. Either is acceptable as long as `tools/validate.mjs` keeps validating the existing `stars.json` schema and the new file has its own validator.

### Three generation entry points (UI surfaces)
1. **Latest-papers digest** — a button "Generate ideas from latest papers" inside the HUD (recommend: add a chip row in the language/style switcher row, or a new bottom-right HUD block mirroring `.hud-tours`).
2. **Free-text topic** — a modal/drawer (recommend: a glass panel similar to `#starCard`) with a textarea and "Generate" button.
3. **Pasted paper refs** — same modal flow, but the input accepts `arXiv:` ids, paper titles, or comma-separated ids that resolve against the existing corpus (semantic match against `stars.json` titles/authors is allowed fallback).

### One-LLM-module rule (no-key-tolerance)
- Exactly **one** module under `src/` wraps the LLM call (recommend `src/llm/ideaGen.js` with a single `generateIdeas({source, payload})` function).
- If `import.meta.env.VITE_OPENAI_API_KEY` (or chosen provider) is missing → that single module throws a *typed* `MissingApiKeyError` and **every generation entry point catches it and shows a non-fatal inline notice** ("Add VITE_OPENAI_API_KEY to enable idea generation") — the star atlas itself keeps loading, rendering, and being interactive. **The app must not crash, must not white-screen, and the existing stars/edges/hover/click flows must still work.**

### Preservation
- Existing imports/exports in `src/main.js` must keep working; the renderer, nebulae, stars, edges, hover, searchBox, starCard, demoStage, tourPlayer pipeline must remain functional.
- The deepfield style must stay on by default (`DEFAULT_PRESET = 'deepfield'` in `src/style/presets.js`) — visual parity against `https://physics-atlas-sigma.vercel.app/?style=deepfield`.

---

## 2. Visual reference facts catalogued against the deepfield live build

Reference screenshots saved to `/Users/aruzhansapayeva/.adal/engineer/tasks/physics-idea-atlas/`:
- `ref_deepfield_overview.jpg` — galaxy in overview after fly-to (no nebulae visible yet, just stars + labels).
- `ref_deepfield_hover.jpg` — post-hover (`Newton's Laws of …`, `Maxwell's Equations`, etc. labels visible).
- `ref_deepfield_nebulae.jpg` — **key ref**: 6 colored dust clouds clearly readable, each tinted by branch colour (amber for classical mechanics, magenta for quantum, etc.), warm haze in the centre. This is the deepfield nebula look.
- `ref_deepfield_zoomed.jpg` — same composition a few seconds later, slightly rotated (camera is damped auto-rotating after 5s of no interaction).

Measured facts (via `getComputedStyle` + `document.querySelectorAll`):

| Property | Value |
|---|---|
| `body` background | `rgb(4, 5, 12)` — near-black, slight blue-violet |
| `scene.background` (preset) | `#050308` (deepfield) |
| HUD pill glass | `rgba(14, 18, 34, 0.38)`, `border: 1px solid rgba(160, 180, 255, 0.14)` |
| HUD backdrop-filter | `blur(14px) saturate(1.3)` |
| `#starCard` face glass | `rgba(10, 14, 28, 0.62)` with `blur(22px) saturate(1.25)` |
| Bloom preset | `strength: 0.72, radius: 0.85, threshold: 0.12` |
| `scene.background` exposure | `1.02` |
| Star colour encoding | branch colour from `BRANCHES` (6 fixed hex) on the halo, white-hot core, additive blend |
| Camera rig damping | `RADIUS_DAMPING = 4.4` (radius), `dampingFactor: 0.055` (orbit), `autoRotate` engages after 5s idle at 0.16× |
| Lens switch | Three layouts — `galaxy / timeline / scale` — animated in ~2.2s |
| Hint text | `DRAG TO ORBIT · SCROLL TO ZOOM` (centered bottom, dim, fades in at 1.8s) |
| Typography | Body in `"Songti SC", "Noto Serif SC", "STSong", serif`; English body in `"Avenir Next", "Helvetica Neue"`; HUD title in 19px letter-spacing 0.42em, dim subtitle 9.5px letter-spacing 0.34em uppercase |

**Parity bar for ideas-node visual treatment:** the addition must remain consistent with this palette (cool deep-space background, additive blending, branch-tinted halo, very dim inked text on glass). A bright candy colour (`#ff3`, `#0f0`) for the novelty score would *break* deepfield — those colours aren't in the palette.

---

## 3. Acceptance criteria (each measurable)

> Numeric thresholds live with the criterion. "I" = measurable in code (console snippet), "V" = measurable in visual side-by-side vs `ref_deepfield_*.jpg`.

### Build & boot
1. **`npm run build` exits 0.** *I* — `cd Physics-atlas-main && npx vite build 2>&1 | tail` shows `built in N.NNs` and no error line. Baseline currently passes (entry 1035 kB / gzip 314 kB).
2. **No `console.error` on load.** *I* — `read_console_messages` with pattern `error|fail|exception` returns an empty array for the first 30s after `Page.frameNavigated` to `/?style=deepfield` (a clean run is currently achievable; the builder must keep it that way).
3. **Existing 162 papers + 331 edges still render and are pickable.** *I* — `document.querySelectorAll('.star-label--high').length >= 6` (6 influence-5 supergiants) and `document.querySelectorAll('.star-label--mid').length > 0` after 8s settle (≥ 0.5s of frame time). Baseline: 8 high + many mid exist.

### Node-class distinctiveness (paper vs idea)
4. **At least one glance-distinct visual signal on idea-stars.** *V* — open any generated idea in the galaxy. A lay tester with no prior context must answer "is this a paper or an idea?" within 2s of looking. Acceptable cues (any one):
   - **shape** (e.g., quad sprite with a distinct silhouette: a small inner ring, an outer dashed halo, an oscillating cross-pattern);
   - **novelty-driven size/glow** (sprite size or core brightness scales monotonically with the 0–100 novelty score — a low-novelty idea must look *less* prominent than a high-novelty one in the same screenshot);
   - **a non-branch hue** layered on top of the branch tint (e.g., a saturated accent that doesn't appear on paper-stars).
5. **Two-population separation in pixel histograms.** *I* — canvas screenshot, sample 30 idea-stars and 30 paper-stars from the JSON via screen-space projection; their mean luminance must differ by **≥ 15 RGB units** *or* their mean hue must differ by **≥ 30°**. (Sub-pixel-perfect halo overlap is acceptable; what matters is that the populations aren't co-located on the canvas at one zoom level.)
6. **Every idea carries `kind: "idea"` and `novelty: 0..100`.** *I* — `Array.isArray(ideasJson) && ideasJson.every(i => i.kind === 'idea' && Number.isInteger(i.novelty) && i.novelty >= 0 && i.novelty <= 100)` is `true`.

### Hover panel (semi-transparent)
7. **Hovering an idea-star reveals a panel that is *visibly semi-transparent over the galaxy*.** *I* — `getComputedStyle(panelEl).backgroundColor` must match `rgba(…,0.4≤α≤0.92)` (extract alpha channel explicitly; the existing `#starCard` is `rgba(10,14,28,0.62)` so the same range is the bar) **and** `getComputedStyle(panelEl).backdropFilter || webkitBackdropFilter` must contain `blur(` (≤ 28px). V — a screenshot of the hover state must show the star field *blurred but still visible* through the panel, not opaque over it.

### Click detail panel (per node type)
8. **Paper panel fields are present.** *I* — when an arbitrary existing paper-star (e.g. id `"kepler-laws"`) is clicked and `#starCard.open` is asserted, the card must contain non-empty text in `.card-title`, `.card-author`, `.card-year`, `.card-eq`, `.card-oneliner`. Existing card must keep working unmodified.
9. **Idea panel fields are present.** *I* — open any idea node: the panel must contain (a) the novelty score rendered as a visible numeric ("87 / 100" or similar, **not** a star icon or bar only) and (b) a list of grounding-paper titles (resolved by id against `stars.json`).
10. **Idea panel closes on the same ESC key as paper panels.** *I* — `keydown` `'Escape'` event fires, the panel loses `.open` class within 500ms. (Existing `src/ui/starCard.js:165` already handles Esc — ideas must reuse this path.)

### Edge animation
11. **Edges between any two nodes animate, not just paper-paper.** *I* — request two consecutive `requestAnimationFrame` ticks at the same radius on a known idea, sum the per-channel diff over a 200×200 region centered on the edge midline; if the diff is non-zero for at least one frame in 1 second, the edge animates. (Baseline edges fragment shader at `src/scene/edges.js:170-172` uses `flow = fract(vT - uTime * 0.07 - vPhase)` — that runs regardless of node kind as long as both endpoints resolve.) V — saving two screenshots ~250ms apart and overlapping them must show line pixels in different positions.
12. **Hovered node lights up its edges; non-neighbours dim to near-zero.** *I* — after triggering hover on node A, read its neighbours from the JSON, then assert that within 600ms the `aHi` attribute (`src/scene/edges.js:88`) of any edge **not** touching A is `0` (sample 10 verts at the midpoint of such an edge via `geometry.getAttribute('aHi').array`). Idea-edges must participate: hover an idea, paper neighbours light up.

### Novelty score visualization
13. **Score is read at a glance from a zoomed-out screenshot.** *V* — open the app, generate ≥ 5 ideas (mock or seeded), zoom to an overview radius (`radius` > 1900). A tester must distinguish a 90-novelty idea from a 30-novelty idea by *size*, *brightness*, *core intensity*, or *post-bloom footprint* — without opening the panel. The signal must scale monotonically: a higher novelty value produces a more prominent sprite (accept any of: larger gl_PointSize, brighter core `exp()` amplitude, or longer spike length).
14. **Score numerical value is rendered in the panel.** *I* — when an idea card is open, the panel `.textContent` contains an integer in `[0, 100]` (regex `/\\b\\d{1,3}\\b/`) that matches `idea.novelty`.

### Generation entry points — flow-level
15. **Entry point 1 (latest-papers digest).** *I* — clicking the button submits a single request to the LLM module with `source: 'latest-papers'` and a payload that includes the latest N papers from the existing corpus. Within 30s the `ideas` array contains ≥ 3 new entries; existing stars untouched.
16. **Entry point 2 (free-text topic).** *I* — opening the modal, typing `"black hole information paradox"`, clicking "Generate" produces ≥ 1 idea with `groundingPapers` referencing real ids from `stars.json` (string-id overlap).
17. **Entry point 3 (pasted paper refs).** *I* — pasting `"2503.01234, 2304.12345"` or two real titles and clicking "Generate" produces ≥ 1 idea whose `groundingPapers` is a non-empty subset of those refs (or normalised titles matched against `stars.json`). Invalid IDs (`9999.99999`) must not throw — the UI shows an inline error toast.

### Error & missing-key behaviour (the trap)
18. **Missing LLM key → no crash.** *I* — clear all `VITE_*` keys, reload. The atlas still draws 162 stars, hover/click works, search works, edge animation works. Opening any generation entry point shows an inline message (`Add VITE_<PROVIDER>_API_KEY to enable idea generation`) **without** sending a network request and **without** an uncaught error in the console. *Pass = console `error` count remains 0 across the flow.*
19. **Network failure → no crash.** *I* — block all `*.openai.com / anthropic.com` traffic in DevTools, click Generate. The catch block in the LLM module triggers; the UI shows a "Generation failed (network). Try again." toast; the atlas continues working.
20. **Empty topic / 0 related papers.** *I* — submitting an empty string ("") or a topic that yields zero candidates from the search corpus produces ≥ 1 idea fallback that is correctly labelled (e.g., "exploratory" or "speculative") and *not* an exception in the console.
21. **Duplicate prevention.** *I* — generate twice with the same source/payload. The second call must dedupe against the first: the `ideas` array length should not grow by more than 10% (or by the model's normal variance if exact dedupe is impossible) — at minimum, no two ideas share identical `(title, summary)` pairs.

### Missing pieces of paper-only machinery
22. **Tours, lens switching, branch focus, search** keep working when ideas co-exist with papers. *I* — switch each lens (Galaxy / Timeline / Scale), open the Search box, type `kepler`, press Enter. Existing flow must still resolve to a paper-star (no regression).
23. **`tools/validate.mjs` exits 0** after new ideas added. *I* — run `node tools/validate.mjs`; if `src/data/ideas.json` exists, valid additions must not break the existing validator. If the builder extends the validator, it must still cover the existing schema fields and `162 stars, 331 edges, 600 dust` baselines.

### Performance
24. **Interactive load < 5s on a normal network.** *I* — `performance.timing.loadEventEnd - navigationStart` is `< 5000ms` over a cold reload in the browser.
25. **Sustained frame ≥ 30fps in the galaxy view.** *I* — sample `performance.now()` deltas over 60 RAF ticks after 8s warmup; `(maxDeltaMs - medianDeltaMs) < 25` and `mean >= 30fps`. Adding ideas must not push this below the bar.
26. **Stars never block ≥ 100ms**. *I* — longtask observer must report no `entry.duration > 100` during a 30s period of hover + camera drag + lens switch + search.

---

## 4. Edge-case families (the *broken* matrix)

| # | Case | Expected behaviour | Cost-of-failure |
|---|---|---|---|
| EC-1 | Offline / 0 connectivity | LLM call rejects; UI shows offline banner; atlas still works | White screen |
| EC-2 | Invalid arXiv ID (`9999.99999`) in pasted refs | Modal highlights bad tokens, doesn't submit | Crash, hard error toast |
| EC-3 | Empty topic / pure whitespace | Submit disabled, or submit yields 1 idea tagged `speculative` | Throw, hang spinner |
| EC-4 | Zero related papers after embedding | UI shows "No close papers found — broadening..." then proceeds; **never** an empty `groundingPapers` masquerading as a real idea | Caller treats empty grounding as scholarly |
| EC-5 | Duplicate generation (same source, same payload) | Deduped: ≤ 1 new idea per call (or model-idempotent generation); no console warnings | Ideas array explodes |
| EC-6 | Rapid repeated Generate clicks (≥ 5 in 2s) | Last-write-wins OR in-flight requests get debounced/cancelled; never more than 1 outstanding LLM request | Multiple LLM charges, race conditions |
| EC-7 | Very long abstracts (> 4 KB each, 50 papers) | Truncate before sending; UI shows "X of N papers used" counter; LLM timeout is enforced (e.g., 25s) | Token blowup, hang |
| EC-8 | Model returns malformed JSON | Parser recovers: retry once with stricter prompt, fall back to placeholder; surface a warning toast | Console errors, broken ideas |
| EC-9 | Idea generation while a panel is already open | Existing panel stays; new idea-cards queue or replace cleanly (pick one and document) | Layout mess |
| EC-10 | Hover an idea whose `id` collides with an existing paper id (regex `^[a-z0-9-]+$`) | Validation rejects at `tools/validate.mjs` time | Render crash from non-unique sprite id |
| EC-11 | Idea with novelty exactly 0 / 100 | Still visually valid (no NaN, no division-by-zero in shader uniforms) | Black sprite or NaN shader errors |
| EC-12 | Generation while lens is mid-animation | Generation completes; lens animation not interrupted; new ideas render in **galaxy** coordinates by default (or in whichever lens is active, with explicit mapping) | Stars jump into wrong layout |
| EC-13 | User switches to EN then generates | i18n strings must not hard-code Chinese; `t('gen.title')` keys registered | "生成" leaks into English build |
| EC-14 | Browser zoomed (≥ 150%) | Panel widths and backdrops stay readable; no horizontal scroll | Layout breaks |
| EC-15 | `prefers-reduced-motion` on | Edge flow, lens transition, intro still respect — or fallback disabled cleanly | Accessibility fail |

---

## 5. Test harness plan (PHASE 2 will execute)

### Browser steps (run in tab `http://localhost:5174/` or builder's dev URL)
1. Open the app cold. Wait 8 s. Screenshot — save as `eval_01_overview.png`.
2. Drag camera, hover, click 3 paper stars. Screenshot each state — `eval_02_hover_*.png`, `eval_03_paper_card_*.png`.
3. Click each of the 3 generation entry points. Capture mid-generation state. Capture final state with new ideas visible. — `eval_04_gen_*_before.png`, `eval_05_gen_*_after.png`.
4. Hover an idea. Click an idea. Screenshot — `eval_06_idea_hover.png`, `eval_07_idea_card.png`.
5. Trigger missing-API-key scenario: reload without `VITE_OPENAI_API_KEY`. Click Generate. — `eval_08_missing_key.png`.
6. Trigger EC-1 (offline) and EC-2 (bad arXiv). — `eval_09_offline.png`, `eval_10_bad_arxiv.png`.
7. Run lens switch to Timeline and Scale with ideas present. — `eval_11_lens_*.png`.

### Console JS snippets (each returns a pass/fail boolean)
```js
// A. Node counts
const arr = (window.__atlas?.stars ?? []);
const ideaCount = Array.isArray(arr) ? arr.filter(s => s.kind === 'idea').length : 0;
const paperCount = arr.length - ideaCount;
// expect paperCount >= 162, ideaCount >= 5

// B. Edge animation
const edges = window.__atlas?.edges ?? [];
const sample = (Math.random() * edges.length) | 0;
const before = window.__atlas?.lineage?.object?.geometry?.attributes?.position?.array.slice() ?? [];
window.__atlas.step(1);              // advance one fixed-step
const after  = window.__atlas?.lineage?.object?.geometry?.attributes?.position?.array.slice() ?? [];
let diff = 0; for (let i = 0; i < before.length; i++) diff += Math.abs(before[i] - after[i]);
// expect diff > 0  → edges animate

// C. Edge non-neighbours dim during hover
const star = arr[0];
window.__atlas?.hover?.lock(star.id);
setTimeout(() => {
  const his = Array.from(window.__atlas?.lineage?.object?.geometry?.attributes?.aHi?.array ?? []);
  const nonTouching = edges
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.from !== star.id && e.to !== star.id);
  // for each, read 10 sample verts and assert all are 0
  // expect: every nonTouching edge has aHi === 0 at all its vertices
}, 200);

// D. Hover panel alpha & blur
const card = document.querySelector('#starCard, [class*="card"]');
const cs = card && getComputedStyle(card);
const alpha = cs && cs.backgroundColor.match(/rgba?\([^)]+\)/)?.[0].split(',').map(s => +s.trim());
const blur  = cs && (cs.backdropFilter || cs.webkitBackdropFilter);
// expect alpha[3] (4th component) in [0.4, 0.92]
// expect /blur\(/.test(blur)

// E. Novelty score appears in card text
const txt = document.querySelector('#starCard')?.textContent ?? '';
// expect /\b\d{1,3}\b/.test(txt) when an idea is open

// F. Console error count
window.__errs = 0;
window.addEventListener('error', () => window.__errs++);
window.addEventListener('unhandledrejection', () => window.__errs++);
// after the full flow, expect window.__errs === 0
```

### Numeric thresholds
| Metric | Bar |
|---|---|
| Build time | `< 12s` (cold `npx vite build`) |
| Cold page load | `< 5000ms` (loadEventEnd − navigationStart) |
| Steady-state FPS | `>= 30` median; `(p99 - p50) < 25ms` |
| Long tasks | `duration < 100ms` throughout test flow |
| Panel alpha | `0.40 ≤ a ≤ 0.92` |
| Panel blur | `4px ≤ blur ≤ 28px` |
| Idea-vs-paper pixel separation | `ΔLuma ≥ 15` OR `ΔHue ≥ 30°` |
| Edge animation | non-zero frame diff in any 1s window |
| Novelty scale | monotonic in sprite prominence (rank correlation > 0.7 over 5+ sampled ideas) |
| Missing-key | `console.error` count `= 0` |
| `node tools/validate.mjs` | exits 0, prints existing baseline numbers (`162 stars, 331 edges`) |

### Screenshot naming
`eval_<step>_<state>[_idea|_paper|_enum].png` saved into `/Users/aruzhansapayeva/.adal/engineer/tasks/physics-idea-atlas/`.

---

## 6. Risks the builder is likely to fall into

1. **Same renderer pass for both node kinds.** Easiest path: cram ideas into the `starsData` array and tweak the existing shader. The risk: ideas accidentally inherit `INFLUENCE_SIZE` size buckets (no novelty axis) and look **identical** to a paper star at overview radius — visual distinctiveness silently fails. Mitigation: at least one of {shape, novelty-driven size, novelty-driven intensity, accent hue} must be a separate code path keyed off `kind === 'idea'`.
2. **Hard-coding LLM into the UI module.** Builder pastes API calls into `src/ui/*` instead of a single `src/llm/*` module. The "missing-key" rule then needs every entry point to handle it individually → inconsistent behaviour. Mitigation: one module, one typed error, one try/catch contract.
3. **Reading `process.env` instead of `import.meta.env`.** Vite only exposes env vars prefixed with `VITE_` through `import.meta.env`. The builder may use `process.env.OPENAI_API_KEY` (server-side only) and the LLM silently never fires; missing-key scenario fails (it never gets tested) and the user sees "no ideas generated" without explanation.
4. **Throwing the response of a non-200 fetch.** Network error path (EC-1) is usually handled but JSON-parse failure (`response.text()` then `JSON.parse` inside `await`) is **not** — and LLM providers love to return 200 + error body. Mitigation: typed `parseLLMResponse(text)` returning a discriminated union.
5. **Generating on every click without debouncing/dedup.** EC-6 silently becomes a billing incident.
6. **Truncating arXiv IDs naively (strip prefix only).** EC-2: `2503.01234` and `cond-mat/0501234` use *different* ID conventions; a flat stripper silently produces an invalid lookup and the idea's `groundingPapers` is empty after the dedupe — passes validation, fails user trust.
7. **i18n strings hard-coded in Chinese in the three modals.** EC-13 leaks "生成" / "灵感" into the English build.
8. **Calling `Math.exp(inf - inf)` in the novelty shader.** Ideas with novelty = 100 saturating an `exp()` can blow up. Mitigation: clamp input domain to `[0, 1]` *before* `exp`.
9. **Forgetting to update `tools/validate.mjs`.** The builder extends `stars.json` with `kind` discriminator; existing validator rejects unknown fields. They patch the validator but break the schema check for `influence`, `frontier`, etc. Mitigation: add new file, leave validator alone.
10. **Sampling pixel histograms at default overview radius only.** At mid-radius the bloom is partially on, paper stars have halos, idea stars are clearly visible — at far radius everything is a dot. The acceptance test must sample **multiple radii**; otherwise the build passes by being below the resolution limit.
11. **No idempotent retry strategy.** EC-8 (malformed JSON) → infinite console errors. Mitigation: one retry with stricter prompt.
12. **Idea edges drawn directly with `LineSegments` using `aType` 0.** New edges between idea↔idea or idea↔paper must still dash correctly when `type === 'inspiration'`. The `src/scene/edges.js` shader already handles this, but the builder may accidentally bypass it by introducing a third renderer.

---

## 7. Definition of done (Phase 1 output)

This document is the deliverable. Acceptance criteria are *measurable* (numbers and `expect`-style snippets), edge-case families cover the *broken* shape, the test harness plan lists exact steps and threshold numbers, and the risk register flags the builder's likely pitfalls. Phase 2 (run-the-app) will exercise this against the live build.
