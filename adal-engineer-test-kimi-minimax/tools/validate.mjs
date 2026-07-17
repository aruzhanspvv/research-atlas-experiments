import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "src/data");

const branchOrder = ["mechanics", "em", "thermo", "relativity", "quantum", "cosmology"];
const branches = new Set(branchOrder);
const edgeTypes = new Set(["derivation", "inspiration", "grounding"]);
const ideaKinds = new Set(["paper", "idea"]);

const errors = [];
const warnings = [];

async function readJson(fileName) {
  const fullPath = path.join(dataDir, fileName);
  try {
    return JSON.parse(await readFile(fullPath, "utf8"));
  } catch (error) {
    errors.push(`${fileName}: cannot parse JSON (${error.message})`);
    return null;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(value, pathName) {
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${pathName}: expected non-empty string`);
  }
}

function requireFiniteNumber(value, pathName) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${pathName}: expected finite number`);
  }
}

function requireIntegerInRange(value, pathName, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    errors.push(`${pathName}: expected integer in [${min}, ${max}], got ${value}`);
  }
}

function requireStringArray(value, pathName) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    errors.push(`${pathName}: expected array of strings`);
  }
}

function isValidArxivId(id) {
  if (typeof id !== "string") return false;
  // Modern YYMM.NNNNN (4-5 digits) or old-style archive/YYMMNNN
  return /^(\d{4}\.\d{4,5}|[a-z\-]+\/\d{7})$/i.test(id);
}

function checkPosition(pos, id) {
  if (!isPlainObject(pos)) {
    errors.push(`stars.${id}.pos: expected object after running layout`);
    return;
  }
  for (const key of ["galaxy", "timeline", "scale"]) {
    const vector = pos[key];
    if (!Array.isArray(vector) || vector.length !== 3 || vector.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
      errors.push(`stars.${id}.pos.${key}: expected [x, y, z] finite numbers`);
    }
  }
}

function validateStar(star, pathName, idToStar, starKinds) {
  if (!isPlainObject(star)) {
    errors.push(`${pathName}: expected object`);
    return;
  }
  const kind = star.kind ?? "paper";

  for (const field of ["id", "name", "branch", "year", "pos"]) {
    if (!(field in star)) errors.push(`${pathName}: missing required field "${field}"`);
  }

  if (typeof star.id === "string" && star.id.length > 0) {
    if (idToStar.has(star.id)) errors.push(`${pathName}.id: duplicate id "${star.id}"`);
    if (!/^[a-z0-9][a-z0-9\-]*$/.test(star.id)) {
      errors.push(`${pathName}.id: must match /^[a-z0-9][a-z0-9\-]*$/ (was "${star.id}")`);
    }
    idToStar.set(star.id, star);
    starKinds.set(star.id, kind);
  } else {
    errors.push(`${pathName}.id: expected non-empty string`);
  }

  if (typeof star.name !== "string" || star.name.length === 0) {
    errors.push(`${pathName}.name: expected non-empty string`);
  }

  if (!branches.has(star.branch)) errors.push(`${pathName}.branch: invalid branch "${star.branch}"`);
  if (!Number.isInteger(star.year)) errors.push(`${pathName}.year: expected integer`);

  if (!ideaKinds.has(kind)) errors.push(`${pathName}.kind: must be "paper" or "idea" (was "${kind}")`);

  // Paper-specific optional fields
  if (kind === "paper") {
    if ("authors" in star) requireStringArray(star.authors, `${pathName}.authors`);
    if ("venue" in star) requireString(star.venue, `${pathName}.venue`);
    if ("arxivId" in star && !isValidArxivId(star.arxivId)) {
      errors.push(`${pathName}.arxivId: invalid arXiv id format "${star.arxivId}"`);
    }
    if ("sourceUrl" in star) requireString(star.sourceUrl, `${pathName}.sourceUrl`);
    if ("abstract" in star) requireString(star.abstract, `${pathName}.abstract`);
  }

  // Idea-specific fields
  if (kind === "idea") {
    requireIntegerInRange(star.novelty, `${pathName}.novelty`, 0, 100);
    if ("summary" in star) requireString(star.summary, `${pathName}.summary`);
    if ("abstract" in star) requireString(star.abstract, `${pathName}.abstract`);
    if ("generatedFrom" in star) requireStringArray(star.generatedFrom, `${pathName}.generatedFrom`);
    if ("evidence" in star && Array.isArray(star.evidence)) {
      star.evidence.forEach((ev, ei) => {
        if (!isPlainObject(ev)) {
          errors.push(`${pathName}.evidence[${ei}]: expected object`);
          return;
        }
        requireString(ev.quote, `${pathName}.evidence[${ei}].quote`);
        requireString(ev.from, `${pathName}.evidence[${ei}].from`);
      });
    }
    if ("ideationPattern" in star && star.ideationPattern !== null) {
      requireString(star.ideationPattern, `${pathName}.ideationPattern`);
    }
  }

  if (!Number.isInteger(star.influence) || star.influence < 1 || star.influence > 5) {
    errors.push(`${pathName}.influence: expected integer 1-5`);
  }
  if (typeof star.frontier !== "boolean") errors.push(`${pathName}.frontier: expected boolean`);
  requireFiniteNumber(star.scaleExp, `${pathName}.scaleExp`);

  checkPosition(star.pos, star.id ?? pathName);
}

const stars = await readJson("stars.json");
const edges = await readJson("edges.json");
const seedPapers = await readJson("seed-papers.json");

// Seed papers must always be present and ≥ 25.
if (seedPapers === null) {
  errors.push("seed-papers.json: missing or invalid");
} else if (!Array.isArray(seedPapers)) {
  errors.push("seed-papers.json: expected top-level array");
} else {
  if (seedPapers.length < 25) {
    errors.push(`seed-papers.json: expected at least 25 seed papers, got ${seedPapers.length}`);
  }
  const seedArxivIds = new Set();
  for (const [index, paper] of seedPapers.entries()) {
    const pathName = `seed-papers[${index}]`;
    if (!isPlainObject(paper)) {
      errors.push(`${pathName}: expected object`);
      continue;
    }
    for (const field of ["id", "arxivId", "title", "year", "branch", "authors", "abstract", "pos"]) {
      if (!(field in paper)) errors.push(`${pathName}: missing required field "${field}"`);
    }
    requireString(paper.id, `${pathName}.id`);
    requireString(paper.arxivId, `${pathName}.arxivId`);
    if (!isValidArxivId(paper.arxivId)) {
      errors.push(`${pathName}.arxivId: invalid arXiv id format "${paper.arxivId}"`);
    }
    if (typeof paper.arxivId === "string") {
      if (seedArxivIds.has(paper.arxivId)) {
        errors.push(`${pathName}.arxivId: duplicate arxiv id "${paper.arxivId}"`);
      }
      seedArxivIds.add(paper.arxivId);
    }
    if (!branches.has(paper.branch)) errors.push(`${pathName}.branch: invalid branch "${paper.branch}"`);
    if (!Number.isInteger(paper.year)) errors.push(`${pathName}.year: expected integer`);
    if (!Array.isArray(paper.authors) || paper.authors.length === 0) {
      errors.push(`${pathName}.authors: expected non-empty array of strings`);
    }
    requireString(paper.title, `${pathName}.title`);
    requireString(paper.abstract, `${pathName}.abstract`);
    checkPosition(paper.pos, paper.id ?? pathName);
  }
}

const idToStar = new Map();
const starKinds = new Map();
const countByKind = { paper: 0, idea: 0 };

if (stars === null) {
  errors.push("stars.json: missing or invalid");
} else if (!Array.isArray(stars)) {
  errors.push("stars.json: expected top-level array");
} else {
  if (stars.length < 25) {
    errors.push(`stars.json: expected at least 25 stars, got ${stars.length}`);
  }
  for (const [index, star] of stars.entries()) {
    validateStar(star, `stars[${index}]`, idToStar, starKinds);
    const kind = star.kind ?? "paper";
    countByKind[kind] = (countByKind[kind] ?? 0) + 1;
  }
}

if (edges === null) {
  errors.push("edges.json: missing or invalid");
} else if (!Array.isArray(edges)) {
  errors.push("edges.json: expected top-level array");
} else {
  if (edges.length < 30) {
    errors.push(`edges.json: expected at least 30 edges, got ${edges.length}`);
  }
  const edgeKeys = new Set();
  for (const [index, edge] of edges.entries()) {
    const pathName = `edges[${index}]`;
    if (!isPlainObject(edge)) {
      errors.push(`${pathName}: expected object`);
      continue;
    }
    requireString(edge.from, `${pathName}.from`);
    requireString(edge.to, `${pathName}.to`);
    if (!edgeTypes.has(edge.type)) errors.push(`${pathName}.type: invalid type "${edge.type}"`);
    if (edge.from === edge.to) errors.push(`${pathName}: self-loop "${edge.from}"`);
    const fromStar = idToStar.get(edge.from);
    const toStar = idToStar.get(edge.to);
    if (!fromStar) errors.push(`${pathName}.from: unknown star id "${edge.from}"`);
    if (!toStar) errors.push(`${pathName}.to: unknown star id "${edge.to}"`);
    const key = `${edge.from}->${edge.to}`;
    if (edgeKeys.has(key)) errors.push(`${pathName}: duplicate edge "${key}"`);
    edgeKeys.add(key);
    if ("weight" in edge) {
      const w = edge.weight;
      if (typeof w !== "number" || !Number.isFinite(w) || w < 0 || w > 1) {
        errors.push(`${pathName}.weight: expected number in [0, 1]`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`validate: failed with ${errors.length} error(s)`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`validate: ok (${stars.length} stars [${countByKind.paper} paper, ${countByKind.idea} idea], ${edges.length} edges, ${seedPapers.length} seed papers)`);
}

if (warnings.length > 0) {
  console.warn(`validate: ${warnings.length} warning(s)`);
  for (const w of warnings) console.warn(`- ${w}`);
}
