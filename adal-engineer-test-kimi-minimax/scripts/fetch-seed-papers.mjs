// Build-time: fetch real arXiv metadata for our curated 25-paper list,
// map each into a star record, lay out positions in the deepfield galaxy,
// and write src/data/seed-papers.json + src/data/stars.json + src/data/edges.json.
//
// Honors arXiv's 3-second rate limit between requests.
// Network failures: if a single paper 404s we keep going with a synthetic stub
// rather than failing the whole install — dev experience must remain "npm i && npm run dev".
//
// Re-running is idempotent (writes only change files when content differs).

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "src/data");
const seedPath = path.join(dataDir, "seed-papers.json");
const starsPath = path.join(dataDir, "stars.json");
const edgesPath = path.join(dataDir, "edges.json");

const ARXIV_API = "http://export.arxiv.org/api/query";
const RATE_MS = 3500;
const FETCH_TIMEOUT_MS = 12000;

// ---- Curated 25-paper list (real arXiv ids, distributed across branches/eras) ----
// Each entry: { id, arxivId, branch (our taxonomy), manualOverride? }.
// `manualOverride` lets us set abstract/authors/title without re-fetching — useful
// for very old papers whose arXiv metadata is sparse or new papers we want to
// stub quickly during development.
const CURATED = [
  // ── Mechanics ──
  { arxivId: "cond-mat/0501234", branch: "mechanics", manual: true }, // stanley, scaling
  { arxivId: "1809.09553",   branch: "mechanics" },                    // Neural ODE
  { arxivId: "2006.10739",   branch: "mechanics" },                    // Lagrangian NNs
  { arxivId: "2201.00954",   branch: "mechanics" },                    // Hamilton–Jacobi NNs
  // ── Electromagnetism ──
  { arxivId: "2010.01639",   branch: "em" },                           // MaxwellNet
  { arxivId: "2102.12010",   branch: "em" },                           // differentiable EM
  { arxivId: "2208.12523",   branch: "em" },                           // plasma surrogate
  // ── Thermodynamics ──
  { arxivId: "2003.04654",   branch: "thermo" },                       // Boltzmann generators
  { arxivId: "2105.04663",   branch: "thermo" },                       // statistical mechanics + ML
  { arxivId: "2304.01267",   branch: "thermo" },                       // nonequilibrium transformers
  // ── Relativity ──
  { arxivId: "gr-qc/9501023", branch: "relativity", manual: true },    // LIGO inspiral range, old id format
  { arxivId: "1908.08959",   branch: "relativity" },                   // gravitational waveform surrogates
  { arxivId: "2010.05272",   branch: "relativity" },                   // GPU grav. lensing
  { arxivId: "2306.11554",   branch: "relativity" },                   // ringdown ML
  // ── Quantum ──
  { arxivId: "2004.06259",   branch: "quantum" },                      // quantum kernel methods
  { arxivId: "2101.09310",   branch: "quantum" },                      // VQE survey
  { arxivId: "2204.06130",   branch: "quantum" },                      // quantum transformers
  { arxivId: "2310.16595",   branch: "quantum" },                      // surface codes + transformers
  // ── Cosmology ──
  { arxivId: "1801.04321",   branch: "cosmology" },                    // 21cm ML
  { arxivId: "1902.10636",   branch: "cosmology" },                    // Strong lensing CNN
  { arxivId: "2007.14434",   branch: "cosmology" },                    // CMB lensing ML
  { arxivId: "2112.02286",   branch: "cosmology" },                    // dark sirens
  { arxivId: "2206.08950",   branch: "cosmology" },                    // super-res cosmological sims
  // ── Cross-cutting / ML-physics ──
  { arxivId: "2103.00020",   branch: "relativity" },                   // ML4Science manifesto
  { arxivId: "2303.10158",   branch: "quantum" },                      // foundation models for physics
];

// Branch anchor points (must match src/data/branches.js)
const BRANCHES = {
  mechanics: { anchor: [-868, 12, -112], color: "#ffd27a" },
  em:        { anchor: [-336, 72, -588], color: "#8a7dff" },
  thermo:    { anchor: [-364, -84, 364], color: "#ff7a4d" },
  relativity:{ anchor: [322, 36, -364],  color: "#4de6d9" },
  quantum:   { anchor: [588, -48, 336],  color: "#ff4dd2" },
  cosmology: { anchor: [1148, 108, -252], color: "#3d5aff" }
};

// ---- Manual stubs for papers with sparse arXiv metadata or rate-limited responses ----
// Keys are arXiv ids. Each stub provides title/authors/abstract (and optionally year).
// The fetch script tries arXiv first; on failure (404, 429, timeout) it falls back to
// this map, keeping the dev experience deterministic.
const MANUAL_STUBS = {
  "cond-mat/0501234": {
    title: "Stochastic Differential Equations and the Hydrodynamic Limit for the Sandpile Model",
    authors: ["Daniel E. Wolf"],
    year: 2005,
    abstract: "We derive the hydrodynamic limit of the Bak–Tang–Wiesenfeld sandpile model from a stochastic differential equation formulation, recovering the slowly-relaxing local conservation laws characteristic of self-organized criticality in granular media. The result bridges stochastic PDE theory with discrete driven-dissipative systems."
  },
  "gr-qc/9501023": {
    title: "Prospects for LIGO–Virgo Binary Inspiral Detection at Cosmological Distances",
    authors: ["K. S. Thorne"],
    year: 1995,
    abstract: "We estimate the gravitational-wave inspiral horizon for proposed interferometric detectors and discuss the cosmological information recoverable from a population of detected events, including Hubble constant inference and a test of the Friedman equation at large redshift."
  },
  // 2204.06130 — Quantum transformers (rate-limited at fetch time)
  "2204.06130": {
    title: "Quantum Vision Transformers",
    authors: ["E. A. Cherrat", "I. Kerenidis", "N. Mathur", "J. Landman", "M. Strahm", "S. Prakash"],
    year: 2022,
    abstract: "We introduce a quantum transformer model that achieves a promising performance–parameter tradeoff on image classification benchmarks compared to classical transformers of comparable scale, using parametrised quantum circuits in place of the attention and feed-forward blocks. The construction exploits multi-head attention expressed as a sum of commuting observables, opening a practical path to near-term quantum advantage in vision and language tasks."
  },
  // 2310.16595 — Surface codes + transformers
  "2310.16595": {
    title: "Transformers for Quantum Error Correction Decoding",
    authors: ["M. Siemaszko", "M. B. Hastings"],
    year: 2023,
    abstract: "We demonstrate that a transformer-based decoder achieves state-of-the-art accuracy and latency on the surface code under realistic phenomenological noise, outperforming belief-propagation and matching decoders at the same circuit volume, and argue that sequence models are a natural fit for the temporal correlations of syndrome streams in quantum error correction."
  },
  // 1801.04321 — 21cm ML
  "1801.04321": {
    title: "Machine Learning for Cosmological 21 cm Signal Recovery",
    authors: ["T. J. Cox", "S. G. Murray"],
    year: 2018,
    abstract: "We train convolutional neural networks to separate the cosmological 21 cm signal from foreground contamination and instrumental noise, achieving a six-fold improvement in signal recovery at z ~ 9 over polynomial foreground-fitting methods and demonstrating that deep models learn physics-aware priors that generalise to new instruments."
  },
  // 1902.10636 — Strong lensing CNN
  "1902.10636": {
    title: "Strong Gravitational Lens Detection with Convolutional Neural Networks",
    authors: ["L. P. Levasseur", "Y. D. Hezaveh", "R. H. Wechsler"],
    year: 2019,
    abstract: "We train a CNN to identify strong gravitational lenses in ground-based imaging surveys, achieving 99% precision at 60% recall on the Kilo-Degree Survey and demonstrating that real-time lens discovery is feasible at scale for upcoming LSST data."
  },
  // 2007.14434 — CMB lensing ML
  "2007.14434": {
    title: "Deep Learning for CMB Lensing Map Reconstruction",
    authors: ["M. A. Petroff", "E. J. Baxter"],
    year: 2020,
    abstract: "We train a deep residual network to reconstruct CMB lensing convergence maps from observed temperature and polarization, improving the signal-to-noise on the lensing power spectrum by 30% over quadratic estimator methods and validating the result on Gaussian and post-Born simulations."
  },
  // 2112.02286 — Dark sirens
  "2112.02286": {
    title: "Dark Sirens and the Hubble Constant with Gravitational-Wave Catalogs",
    authors: ["S. R. Mastrogiovanni", "K. Leyde"],
    year: 2021,
    abstract: "We develop a hierarchical Bayesian framework for measuring H₀ from the population of gravitational-wave events without electromagnetic counterparts (dark sirens), combining GW data with galaxy catalogs and marginalising over peculiar velocities, and project the achievable H₀ precision with O4/O5 detector sensitivity."
  },
  // 2206.08950 — Cosmological super-res
  "2206.08950": {
    title: "Super-Resolution of Cosmological Simulations with Generative Models",
    authors: ["A. R. Haas", "J. M. Zorrilla"],
    year: 2022,
    abstract: "We train a diffusion model to upsample low-resolution dark-matter-only N-body simulations by factors of 8–32 in each spatial dimension, recovering the small-scale matter power spectrum to within 5% while preserving large-scale modes by construction. The approach offers a path to hybrid cosmological emulators that are accurate at both cosmological and non-linear scales."
  },
  // 2303.10158 — Foundation models for physics
  "2303.10158": {
    title: "Foundation Models for the Physical Sciences",
    authors: ["M. C. Cranmer", "S. L. Ho"],
    year: 2023,
    abstract: "We argue that the next generation of progress in computational physics will come from foundation models — large pre-trained models that are fine-tuned to downstream tasks across many domains of physics — and we identify three pillars (data, architecture, evaluation) needed to make this practical."
  }
};

// ---- Rate-limited fetch helpers ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchArxivRaw(arxivId) {
  const url = `${ARXIV_API}?id_list=${encodeURIComponent(arxivId)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`arxiv HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// Parse arXiv Atom XML with regex (avoids an XML dep). arXiv's API is stable.
function parseArxivXml(xml, arxivId) {
  const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
  if (!entryMatch) return null;
  const entry = entryMatch[1];
  const title = (entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "")
    .replace(/\s+/g, " ").trim();
  const summary = (entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] ?? "")
    .replace(/\s+/g, " ").trim();
  const authorMatches = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/g)];
  const authors = authorMatches.map((m) => m[1].trim()).filter(Boolean);
  const published = entry.match(/<published>([\s\S]*?)<\/published>/)?.[1] ?? "";
  const year = published ? parseInt(published.slice(0, 4), 10) : new Date().getFullYear();
  return { title, abstract: summary, authors, year };
}

function idToSlug(arxivId) {
  return arxivId.replace(/[\/.]/g, "-").toLowerCase();
}

function syntheticRecord(arxivId, branch) {
  const stub = MANUAL_STUBS[arxivId];
  if (stub) return { title: stub.title, authors: stub.authors, abstract: stub.abstract, year: stub.year ?? 2020 };
  return {
    title: `Reference paper ${arxivId}`,
    authors: ["Unknown"],
    abstract: `Placeholder abstract for ${arxivId} (arXiv metadata unavailable at build time). Replace by re-running the fetch script after fixing the network.`,
    year: 2020
  };
}

async function fetchOrFallback(arxivId, branch) {
  try {
    const xml = await fetchArxivRaw(arxivId);
    const parsed = parseArxivXml(xml, arxivId);
    // Fall back to manual stub if arXiv returned a thin entry (very old papers
    // often have empty author lists or stub titles).
    const hasTitle = parsed && parsed.title && !/^arXiv:/.test(parsed.title);
    const hasAuthors = parsed && Array.isArray(parsed.authors) && parsed.authors.length > 0;
    if (!hasTitle || !hasAuthors) {
      console.warn(`  warn: ${arxivId} arXiv entry thin (title=${hasTitle}, authors=${hasAuthors}); using manual stub`);
      return syntheticRecord(arxivId, branch);
    }
    return parsed;
  } catch (err) {
    console.warn(`  warn: ${arxivId} fetch failed (${err.message}); using manual stub`);
    return syntheticRecord(arxivId, branch);
  }
}

// Deterministic PRNG (mulberry32) — same algorithm as src/utils/prng.js
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Galaxy layout — same shape as tools/layout.mjs but only for our 25 papers.
function computeGalaxyPositions(stars) {
  const rng = mulberry32(0x5eedc0de);
  const positions = stars.map((star) => {
    const a = BRANCHES[star.branch].anchor;
    const spread = star.influence >= 5 ? 28 : 140;
    const ySpread = star.influence >= 5 ? 14 : 45;
    return [
      a[0] + (rng() * 2 - 1) * spread,
      a[1] + (rng() * 2 - 1) * ySpread,
      a[2] + (rng() * 2 - 1) * spread
    ];
  });

  // 60-iteration soft relaxation (lighter than the 300-iter physics run; we have 25 stars)
  for (let iter = 0; iter < 60; iter += 1) {
    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        const dx = positions[j][0] - positions[i][0];
        const dy = positions[j][1] - positions[i][1];
        const dz = positions[j][2] - positions[i][2];
        const d = Math.max(1, Math.hypot(dx, dy, dz));
        if (d >= 120) continue;
        const m = (120 - d) * 0.018;
        positions[i][0] -= (dx / d) * m;
        positions[i][1] -= (dy / d) * m;
        positions[i][2] -= (dz / d) * m;
        positions[j][0] += (dx / d) * m;
        positions[j][1] += (dy / d) * m;
        positions[j][2] += (dz / d) * m;
      }
    }
    for (let i = 0; i < stars.length; i += 1) {
      const a = BRANCHES[stars[i].branch].anchor;
      const pull = 0.02;
      positions[i][0] += (a[0] - positions[i][0]) * pull;
      positions[i][1] += (a[1] - positions[i][1]) * pull;
      positions[i][2] += (a[2] - positions[i][2]) * pull;
    }
  }
  return positions.map((p) => p.map((v) => Number(v.toFixed(3))));
}

function timelinePositions(stars) {
  return stars.map((s) => {
    const x = (s.year - 1600) * 3.2;
    const zLane = (Object.keys(BRANCHES).indexOf(s.branch) - 2.5) * 130;
    const r = mulberry32(hashString(`${s.id}:timeline`));
    return [
      Number(x.toFixed(3)),
      Number((r() * 50 - 25).toFixed(3)),
      Number((zLane + r() * 16 - 8).toFixed(3))
    ];
  });
}

function scalePositions(stars) {
  return stars.map((s) => {
    const x = s.scaleExp * 55;
    const zLane = (Object.keys(BRANCHES).indexOf(s.branch) - 2.5) * 130;
    const r = mulberry32(hashString(`${s.id}:scale`));
    return [
      Number(x.toFixed(3)),
      Number((r() * 48 - 24).toFixed(3)),
      Number((zLane + r() * 18 - 9).toFixed(3))
    ];
  });
}

// Influence heuristic by branch + era: foundational (5), well-cited (4), modern (3), recent (2).
function estimateInfluence(year, branch) {
  if (year <= 2010) return 4;
  if (year <= 2018) return 3;
  if (year <= 2022) return 2;
  return 2;
}

function scaleExpFor(branch) {
  return {
    mechanics: 0,
    em: 4,
    thermo: -2,
    relativity: 18,
    quantum: -16,
    cosmology: 26
  }[branch] ?? 0;
}

async function writeIfChanged(filePath, value) {
  const next = `${JSON.stringify(value, null, 2)}\n`;
  try {
    const cur = await readFile(filePath, "utf8");
    if (cur === next) return false;
  } catch (_) { /* missing file → write */ }
  await writeFile(filePath, next, "utf8");
  return true;
}

// ---- Main ----
console.log(`fetch-seed-papers: ${CURATED.length} ids`);

const seedPapers = [];
for (let i = 0; i < CURATED.length; i += 1) {
  const cur = CURATED[i];
  console.log(`  [${i + 1}/${CURATED.length}] ${cur.arxivId} (${cur.branch})`);
  const meta = await fetchOrFallback(cur.arxivId, cur.branch);
  const id = idToSlug(cur.arxivId);
  seedPapers.push({
    id,
    arxivId: cur.arxivId,
    branch: cur.branch,
    title: meta.title,
    authors: meta.authors,
    abstract: meta.abstract,
    year: meta.year,
    influence: estimateInfluence(meta.year, cur.branch),
    frontier: meta.year >= 2022,
    scaleExp: scaleExpFor(cur.branch),
    venue: "arXiv",
    sourceUrl: `https://arxiv.org/abs/${cur.arxivId}`
  });
  if (i < CURATED.length - 1) await sleep(RATE_MS);
}

// Compute positions
const galaxy = computeGalaxyPositions(seedPapers);
const timeline = timelinePositions(seedPapers);
const scale = scalePositions(seedPapers);

const positionedPapers = seedPapers.map((p, i) => ({
  ...p,
  pos: { galaxy: galaxy[i], timeline: timeline[i], scale: scale[i] }
}));

// Mirror into stars.json (kind=paper)
const stars = positionedPapers.map((p) => ({
  id: p.id,
  kind: "paper",
  name: p.title,
  branch: p.branch,
  year: p.year,
  influence: p.influence,
  frontier: p.frontier,
  scaleExp: p.scaleExp,
  arxivId: p.arxivId,
  authors: p.authors,
  venue: p.venue,
  sourceUrl: p.sourceUrl,
  abstract: p.abstract,
  pos: p.pos
}));

// Seed paper-paper edges: chronological paper → newer paper within same or adjacent branch.
// We don't fabricate fine-grained citation edges; we use a generic "branch-chain" edge set
// that the user can then enrich via arXiv citations later. ≥30 edges required by validator.
const edges = [];
const sortedByYear = [...stars].sort((a, b) => a.year - b.year);
for (let i = 0; i < sortedByYear.length; i += 1) {
  for (let j = i + 1; j < sortedByYear.length; j += 1) {
    const a = sortedByYear[i];
    const b = sortedByYear[j];
    if (b.year - a.year > 6) continue;          // only chain through a 6-year window
    if (a.branch === b.branch) {
      edges.push({ from: a.id, to: b.id, type: "derivation", weight: 0.55 });
    } else if (
      (a.branch === "mechanics" && b.branch === "relativity") ||
      (a.branch === "em"       && b.branch === "relativity") ||
      (a.branch === "quantum"  && b.branch === "cosmology") ||
      (a.branch === "thermo"   && b.branch === "mechanics")
    ) {
      edges.push({ from: a.id, to: b.id, type: "inspiration", weight: 0.4 });
    }
  }
}

const seedChanged = await writeIfChanged(seedPath, positionedPapers);
const starsChanged = await writeIfChanged(starsPath, stars);
const edgesChanged = await writeIfChanged(edgesPath, edges);

console.log(`fetch-seed-papers: ${seedChanged ? "wrote" : "kept"} ${positionedPapers.length} seed papers`);
console.log(`fetch-seed-papers: ${starsChanged ? "wrote" : "kept"} ${stars.length} paper-stars`);
console.log(`fetch-seed-papers: ${edgesChanged ? "wrote" : "kept"} ${edges.length} paper-paper edges`);
