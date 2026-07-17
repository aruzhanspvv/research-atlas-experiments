// ONE LLM module. Every idea-generation entry point in the app goes through
// generateIdeas() below. Missing keys → typed MissingApiKeyError; the caller
// catches it once and shows the inline banner — no console errors, no crash.
//
// Reading env: we read import.meta.env.VITE_LLM_* directly (the ONLY supported
// path in Vite). process.env.* would silently return undefined in the browser.

import PATTERNS from '../data/ideation-patterns.json'

// ---------- Typed errors (single source of truth for caller catch blocks) ----------
export class MissingApiKeyError extends Error {
  constructor(message) { super(message); this.name = 'MissingApiKeyError' }
}
export class LLMNetworkError extends Error {
  constructor(message) { super(message); this.name = 'LLMNetworkError' }
}
export class LLMParsedError extends Error {
  constructor(message, { rawText } = {}) { super(message); this.name = 'LLMParsedError'; this.rawText = rawText }
}

// ---------- Config (import.meta.env is the ONLY path we read) ----------
function readConfig() {
  const baseUrl = (import.meta.env?.VITE_LLM_BASE_URL ?? '').trim().replace(/\/+$/, '')
  const apiKey = (import.meta.env?.VITE_LLM_API_KEY ?? '').trim()
  const model = (import.meta.env?.VITE_LLM_MODEL ?? '').trim()
  const mockFlag = String(import.meta.env?.VITE_LLM_MOCK ?? '').trim() === '1'
  return { baseUrl, apiKey, model, mockFlag }
}

export function llmStatus() {
  const cfg = readConfig()
  if (cfg.mockFlag) return { ready: true, reason: 'mock' }
  if (!cfg.baseUrl) return { ready: false, reason: 'missing VITE_LLM_BASE_URL' }
  if (!cfg.apiKey)  return { ready: false, reason: 'missing VITE_LLM_API_KEY' }
  if (!cfg.model)    return { ready: false, reason: 'missing VITE_LLM_MODEL' }
  return { ready: true, reason: 'live' }
}

// ---------- Prompt assembly ----------
const SYSTEM_PROMPT = `You are an expert research ideation assistant.

You will be given an evidence bundle: the titles and abstracts of several real research papers. Your job is to propose ONE novel, evidence-grounded research idea that follows from these papers but opens up a new direction.

You must classify the idea into:
1. An opportunity pattern: bridge | gap | limit | reframing
   (bridge=connects distant bodies of work, gap=closes an unresolved bottleneck, limit=extends a method's regime, reframing=recasts the problem in a new frame)
2. A research paradigm: synthesis | extension | novel-mechanism | new-domain

Then output ONLY this JSON shape, no prose:
{
  "title": "≤ 14 words",
  "summary": "2-3 sentence proposal",
  "abstract": "1 paragraph technical description (≤ 200 words)",
  "ideationPattern": "<one of the 15 pattern ids below>",
  "evidence": [
    {"quote": "verbatim sentence from a grounding abstract", "from": "<arxiv id or paper id>"}
  ]
}

The 15 pattern ids are:
${PATTERNS.patterns.map((p) => `- ${p.id} — ${p.label}: ${p.description}`).join('\n')}

Rules:
- Evidence quotes MUST be verbatim substrings of the supplied abstracts.
- Include 1–5 evidence quotes (more is better, up to 5).
- The idea must NOT simply restate one of the input papers — extend, reframe, or transfer.
- Output ONLY the JSON object.`

function buildUserPrompt(payload) {
  const lines = []
  if (payload.topic) lines.push(`Topic: ${payload.topic}`)
  if (payload.mode) lines.push(`Generation mode: ${payload.mode}`)
  lines.push('')
  lines.push('Evidence bundle:')
  payload.papers.forEach((p, i) => {
    const id = p.arxivId ?? p.id ?? `paper-${i + 1}`
    lines.push(`\n--- [${id}] ${p.title ?? ''}`)
    if (Array.isArray(p.authors) && p.authors.length) lines.push(`Authors: ${p.authors.join(', ')}`)
    if (p.year) lines.push(`Year: ${p.year}`)
    if (p.abstract) lines.push(`Abstract: ${p.abstract.slice(0, 1500)}`)
  })
  lines.push('')
  lines.push('Now output the JSON idea.')
  return lines.join('\n')
}

// ---------- Mock generator (used when VITE_LLM_MOCK=1) ----------
// Returns a deterministic canned idea so the full UI pipeline can be exercised
// without an API key. Coverage/distance vary by topic string so the novelty
// score shows variety across multiple calls.
function mockIdea(payload, idx = 0) {
  const topic = payload.topic || 'machine learning for physics'
  const papers = payload.papers || []
  const groundingIds = papers.slice(0, 3).map((p) => p.arxivId ?? p.id)
  const evidence = papers.slice(0, 3).map((p) => ({
    quote: (p.abstract ?? '').split(/\.(?:\s|$)/)[0]?.slice(0, 240) || 'evidence stub',
    from: p.arxivId ?? p.id ?? 'unknown'
  })).filter((e) => e.quote && e.from)
  const patternIds = PATTERNS.patterns.map((p) => p.id)
  const pattern = patternIds[(idx + topic.length) % patternIds.length]
  // EC-2/EC-4: when the caller signals a speculative run (pasted refs that
  // failed to resolve), fold a deterministic salt into the title so two
  // different unresolved-ref sets cannot collide on the same idea id.
  const salt = payload.__salt || ''
  const tag = payload.__speculative ? ' (speculative)' : ''
  return {
    title: salt
      ? `Mock idea #${idx + 1} [${salt.slice(-6)}]: applying ${pattern} to ${topic}${tag}`
      : `Mock idea #${idx + 1}: applying ${pattern} to ${topic}`,
    summary: `A ${pattern}-style proposal grounded in ${papers.length || 0} papers from the bundle, exploring how ${topic} can be reframed through a transfer or gap-closing mechanism.${tag}`,
    abstract: `We propose to extend recent work on ${topic} by combining the methodological strengths of the supplied evidence bundle with a fresh operational lens. Building on ${groundingIds.join(', ')}, the idea targets an underexplored regime where existing approaches break down and proposes a concrete intervention. The result should generalise beyond the immediate setting while remaining testable with the available data.${salt ? ` Salt: ${salt}.` : ''}`,
    ideationPattern: pattern,
    evidence: evidence.length ? evidence : [{ quote: 'No grounding papers supplied — speculative idea.', from: 'self' }]
  }
}

// ---------- Response parsing (discriminated union) ----------
// Returns { ok: true, idea } or { ok: false, error }. Callers handle both.
function parseLLMResponse(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    return { ok: false, error: new LLMParsedError('empty response', { rawText }) }
  }
  // Strip ```json fences if present
  let text = rawText.trim()
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  // Find the outermost JSON object
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first < 0 || last <= first) {
    return { ok: false, error: new LLMParsedError('no JSON object in response', { rawText }) }
  }
  const candidate = text.slice(first, last + 1)
  let obj
  try {
    obj = JSON.parse(candidate)
  } catch (e) {
    return { ok: false, error: new LLMParsedError(`JSON.parse failed: ${e.message}`, { rawText }) }
  }
  // Validate required fields
  const required = ['title', 'summary', 'abstract', 'ideationPattern', 'evidence']
  for (const f of required) {
    if (!(f in obj)) {
      return { ok: false, error: new LLMParsedError(`missing field "${f}"`, { rawText }) }
    }
  }
  if (!Array.isArray(obj.evidence) || obj.evidence.length === 0) {
    return { ok: false, error: new LLMParsedError('evidence must be a non-empty array', { rawText }) }
  }
  return { ok: true, idea: obj }
}

// ---------- Public API ----------
export async function generateIdeas(payload = {}) {
  const cfg = readConfig()
  const status = llmStatus()

  // Mock mode — return a deterministic canned idea (used by tests).
  if (status.reason === 'mock') {
    const idea = mockIdea(payload, payload.__mockIndex ?? 0)
    return { ok: true, idea, transport: 'mock' }
  }

  // Missing key — typed error; caller catches and shows banner.
  if (!status.ready) {
    throw new MissingApiKeyError(status.reason)
  }

  // Live call. Defensive: clamp long abstracts to avoid token blowup.
  const safePayload = {
    ...payload,
    papers: (payload.papers ?? []).slice(0, 12).map((p) => ({
      ...p,
      abstract: (p.abstract ?? '').slice(0, 1500)
    }))
  }
  const userPrompt = buildUserPrompt(safePayload)

  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 25_000)

  let res
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ]
      })
    })
  } catch (err) {
    if (err?.name === 'AbortError') throw new LLMNetworkError('LLM request timed out after 25s')
    throw new LLMNetworkError(`LLM network error: ${err?.message ?? 'unknown'}`)
  } finally {
    clearTimeout(timeout)
  }

  // 200 + JSON body is the happy path; we still check for errors that arrive as 200.
  let body
  try {
    body = await res.json()
  } catch (e) {
    throw new LLMParsedError(`LLM returned non-JSON body (HTTP ${res.status})`, { rawText: await res.text().catch(() => '') })
  }
  if (!res.ok || body?.error) {
    const msg = body?.error?.message || `LLM HTTP ${res.status}`
    throw new LLMNetworkError(msg)
  }

  const raw = body?.choices?.[0]?.message?.content
  const parsed = parseLLMResponse(typeof raw === 'string' ? raw : JSON.stringify(raw ?? {}))
  if (!parsed.ok) {
    // Retry once with stricter prompt before giving up.
    const retry = await retryOnceWithStricterPrompt(safePayload, cfg)
    if (retry.ok) return { ok: true, idea: retry.idea, transport: 'live-retry' }
    throw parsed.error
  }
  return { ok: true, idea: parsed.idea, transport: 'live' }
}

async function retryOnceWithStricterPrompt(payload, cfg) {
  const userPrompt = buildUserPrompt(payload) + '\n\nREMINDER: Output ONLY the JSON object. No markdown fences, no commentary.'
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 25_000)
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ]
      })
    })
    if (!res.ok) return { ok: false }
    const body = await res.json()
    const raw = body?.choices?.[0]?.message?.content
    return parseLLMResponse(typeof raw === 'string' ? raw : JSON.stringify(raw ?? {}))
  } catch {
    return { ok: false }
  } finally {
    clearTimeout(timeout)
  }
}

// Convenience: list the 15 pattern labels (for the UI pattern picker).
export function listPatterns() {
  return PATTERNS.patterns.map((p) => ({
    id: p.id,
    label: p.label,
    opportunity: p.opportunity,
    paradigm: p.paradigm
  }))
}
