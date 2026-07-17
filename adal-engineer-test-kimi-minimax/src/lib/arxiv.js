// arXiv API wrapper (browser-side, CORS-friendly via export.arxiv.org).
// Single source of truth for "what is a real arXiv id" — both modern (YYMM.NNNNN)
// and old-style archive/YYMMNNN (cond-mat/0501234, gr-qc/9501023, ...).
// Errors are typed (see exports) so the caller can distinguish "not found" from
// "network gone" without scattering string matching across the codebase.

export class ArxivError extends Error {
  constructor(message, { kind = 'unknown', arxivId } = {}) {
    super(message);
    this.name = 'ArxivError';
    this.kind = kind;          // 'not-found' | 'rate-limit' | 'network' | 'parse' | 'invalid-id'
    this.arxivId = arxivId;
  }
}

const ARXIV_API = 'http://export.arxiv.org/api/query';
const TIMEOUT_MS = 12_000;

export function isValidArxivId(id) {
  if (typeof id !== 'string') return false;
  return /^(\d{4}\.\d{4,5}|[a-z\-]+\/\d{7})$/i.test(id.trim());
}

// Normalise an arXiv id from user input. Accepts bare ids, "arXiv:" prefix,
// "https://arxiv.org/abs/..." URLs. Returns null if the string can't be parsed.
export function normaliseArxivId(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim();
  if (!s) return null;
  // Strip URL prefix
  s = s.replace(/^https?:\/\/(www\.)?arxiv\.org\/(abs|pdf)\//i, '');
  s = s.replace(/\.pdf$/i, '');
  // Strip "arXiv:" prefix
  s = s.replace(/^arxiv:\s*/i, '');
  if (!isValidArxivId(s)) return null;
  return s;
}

// Tokenise free-text input into arXiv ids (and title snippets for semantic fallback).
// Tokens that look like arXiv ids are extracted verbatim; the rest is treated as
// free text and returned as a single title query string.
export function tokeniseInput(input) {
  const ids = [];
  const titles = [];
  if (typeof input !== 'string') return { ids, titles };
  // Split on commas / semicolons / whitespace
  const parts = input.split(/[,\s;]+/).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const norm = normaliseArxivId(part);
    if (norm) ids.push(norm);
    else if (part.length > 8) titles.push(part);
  }
  return { ids, titles };
}

async function fetchRaw(arxivId) {
  const url = `${ARXIV_API}?id_list=${encodeURIComponent(arxivId)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (res.status === 429) {
      throw new ArxivError(`arXiv rate-limited (429) for ${arxivId}`, { kind: 'rate-limit', arxivId });
    }
    if (res.status === 404) {
      throw new ArxivError(`arXiv returned 404 for ${arxivId}`, { kind: 'not-found', arxivId });
    }
    if (!res.ok) {
      throw new ArxivError(`arXiv HTTP ${res.status} for ${arxivId}`, { kind: 'network', arxivId });
    }
    return await res.text();
  } catch (err) {
    if (err instanceof ArxivError) throw err;
    if (err?.name === 'AbortError') {
      throw new ArxivError(`arXiv fetch timed out for ${arxivId}`, { kind: 'network', arxivId });
    }
    throw new ArxivError(`arXiv network error for ${arxivId}: ${err?.message ?? 'unknown'}`, { kind: 'network', arxivId });
  } finally {
    clearTimeout(t);
  }
}

function parseXml(xml) {
  const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
  if (!entryMatch) return null;
  const entry = entryMatch[1];
  const title = (entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').replace(/\s+/g, ' ').trim();
  const summary = (entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] ?? '').replace(/\s+/g, ' ').trim();
  const authorMatches = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/g)];
  const authors = authorMatches.map((m) => m[1].trim()).filter(Boolean);
  const published = entry.match(/<published>([\s\S]*?)<\/published>/)?.[1] ?? '';
  const year = published ? parseInt(published.slice(0, 4), 10) : new Date().getFullYear();
  return { title, abstract: summary, authors, year };
}

// Fetch a single arXiv entry by id and return a normalised record.
// Throws ArxivError on any failure (caller catches).
export async function fetchPaper(arxivId) {
  const norm = normaliseArxivId(arxivId);
  if (!norm) throw new ArxivError(`Not a valid arXiv id: "${arxivId}"`, { kind: 'invalid-id', arxivId });
  const xml = await fetchRaw(norm);
  const parsed = parseXml(xml);
  if (!parsed) {
    throw new ArxivError(`arXiv returned empty entry for ${norm}`, { kind: 'parse', arxivId: norm });
  }
  return {
    arxivId: norm,
    title: parsed.title,
    abstract: parsed.abstract,
    authors: parsed.authors,
    year: parsed.year,
    sourceUrl: `https://arxiv.org/abs/${norm}`
  };
}

// Fetch many ids sequentially, returning per-id { ok, paper | error }.
// Failures don't short-circuit the batch — callers can degrade gracefully.
export async function fetchPapers(arxivIds) {
  const out = [];
  for (const id of arxivIds) {
    try {
      const paper = await fetchPaper(id);
      out.push({ ok: true, paper });
    } catch (err) {
      out.push({ ok: false, error: err, arxivId: id });
      // Be polite to arXiv; also helps recover from rate limits
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return out;
}

// Map a fetched arXiv record + branch assignment into a star record.
// Branch is decided by the caller (we don't try to infer it from text).
export function paperToStar(paper, branch, idIndex) {
  return {
    id: idIndex ?? `arxiv-${paper.arxivId.replace(/[\/.]/g, '-').toLowerCase()}`,
    kind: 'paper',
    name: paper.title,
    branch,
    year: paper.year,
    influence: paper.year <= 2015 ? 4 : 3,
    frontier: paper.year >= 2022,
    scaleExp: 0,                    // caller overrides per branch
    arxivId: paper.arxivId,
    authors: paper.authors,
    venue: 'arXiv',
    sourceUrl: paper.sourceUrl,
    abstract: paper.abstract
    // pos is filled by the layout step; we don't synthesise positions here.
  };
}
