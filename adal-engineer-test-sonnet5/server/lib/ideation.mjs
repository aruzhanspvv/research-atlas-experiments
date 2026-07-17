// Idea-generation pipeline. Methodology grounded in:
//  - ResearchStudio-Idea (arXiv:2607.04439): evidence-grounded, pattern-guided
//    generation + prior-art collision awareness ("Scoop-Check").
//  - Measuring the Gap Between Human and LLM Research Ideas (arXiv:2607.01233):
//    LLM ideas cluster around "bridge-like opportunities" and "synthesis
//    methods" — narrower than human research taste. We ask the model to
//    self-tag opportunity-pattern + paradigm so novelty.mjs can penalize
//    over-represented (bridge/synthesis) clusters.
//
// CONTRACT: idea generation REQUIRES a real LLM call. There is no
// template-based fallback — if no API key is configured, generateIdeas()
// throws a clear error that the route handler surfaces to the client as a
// 503 with an actionable message (see routes/generateIdeas.mjs).
import { fetchWithTimeout, FetchTimeoutError } from './fetchTimeout.mjs'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const CHAT_MODEL = process.env.CHAT_MODEL || 'gpt-4o-mini'

// MOCK MODE (demo/testing without a real key): when MOCK_LLM=1, the server
// returns deterministic mock ideas through the SAME data contract as a real
// LLM call, so the entire UI flow (topic/paper → ideas → novelty aura →
// edges → detail panel) is demonstrable end-to-end. This lives ONLY in the
// server (never a frontend hack) and is clearly marked in the rationale.
const MOCK_LLM = process.env.MOCK_LLM === '1' || process.env.MOCK_LLM === 'true'

export function hasLlmProvider() {
  return Boolean(OPENAI_API_KEY) || MOCK_LLM
}

export function isMockMode() {
  return MOCK_LLM && !OPENAI_API_KEY
}

// Deterministic mock idea generation. Produces the same post-processing
// output shape as generateIdeas() below (title/summary/fullText/
// generatedFrom/ideationPattern/opportunityPattern/researchParadigm/
// differentiation), grounded in the actual evidence papers passed in, so the
// route's persistence/novelty/placement/edge logic runs unchanged.
function mockIdeas({ evidence, mode, topic }) {
  const e0 = evidence[0]
  const e1 = evidence[1] || evidence[0]
  const base = mode === 'topic' ? topic : e0?.title || 'the referenced work'
  const grounded = (idxs) => idxs.map((i) => evidence[i]?.id).filter(Boolean)
  const ts = Date.now()
  return [
    {
      title: `Bottleneck-Targeted Redesign of ${titleCase(base)} Pipelines`,
      summary: `A focused study that isolates the single highest-friction step in ${base} and redesigns it directly, rather than scaling the whole pipeline. Grounded in "${e0?.title || 'prior work'}".`,
      fullText: `Problem: existing work on ${base} scales end-to-end but rarely isolates which step limits quality.\n\nApproach: we instrument the pipeline to attribute downstream failure to a single bottleneck stage, then redesign only that stage with a targeted mechanism.\n\nEvaluation: ablate each stage, measuring the marginal gain per unit of added compute.\n\nRisks: the bottleneck may shift after the first fix, requiring iterative re-diagnosis.\n\n[MOCK_LLM deterministic output]`,
      generatedFrom: grounded([0]),
      ideationPattern: 'bottleneck removal',
      opportunityPattern: 'bottleneck',
      researchParadigm: 'empirical',
      differentiation: `Prior work such as "${e0?.title || 'the evidence'}" improves the pipeline as a whole; this idea targets one diagnosed bottleneck stage directly.`
    },
    {
      title: `A Harder Evaluation Benchmark for ${titleCase(base)}`,
      summary: `Existing methods for ${base} report success on narrow benchmarks; this work proposes a more faithful evaluation and a baseline designed to pass it. Extends "${e1?.title || 'prior work'}".`,
      fullText: `Problem: claimed progress on ${base} rests on benchmarks that under-represent real difficulty.\n\nApproach: we construct a harder, more faithful evaluation suite and characterize where current methods fail.\n\nEvaluation: we release the benchmark plus a baseline method and report gap analysis across settings.\n\nRisks: a harder benchmark may be noisier; we mitigate with human-verified labels.\n\n[MOCK_LLM deterministic output]`,
      generatedFrom: grounded([1, 0]),
      ideationPattern: 'evaluation-gap fill',
      opportunityPattern: 'evaluation-critique',
      researchParadigm: 'benchmark-construction',
      differentiation: `Unlike "${e1?.title || 'the evidence'}", which introduces a method, this idea first fixes the evaluation that methods are judged by.`
    },
    {
      title: `Cross-Domain Transfer of ${titleCase(base)} Techniques`,
      summary: `We transfer a technique proven in ${base} to an underexplored adjacent domain, testing whether its core inductive bias still holds. Inspired by "${e0?.title || 'prior work'}".`,
      fullText: `Problem: techniques validated in ${base} are rarely tested outside their home domain.\n\nApproach: we port the core mechanism to an adjacent domain and adapt its assumptions minimally.\n\nEvaluation: we compare transfer against a domain-native baseline across three tasks.\n\nRisks: the inductive bias may not transfer; we report negative results honestly.\n\n[MOCK_LLM deterministic output]`,
      generatedFrom: grounded([0]),
      ideationPattern: 'cross-domain transfer',
      opportunityPattern: 'gap-framing',
      researchParadigm: 'empirical',
      differentiation: `"${e0?.title || 'The evidence'}" validates the technique in-domain; this idea tests its generality across domains.`
    }
  ]
}

function titleCase(s) {
  return String(s || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .map((w) => (w.length > 3 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

// Lightweight local analog of ResearchStudio-Idea's 15 mined ideation
// patterns — a hand-written table of common research-idea shapes, given to
// the model as inspiration/vocabulary, not a reimplementation of their
// corpus-mined pattern cards.
const IDEATION_PATTERNS = [
  'cross-domain transfer: apply a technique proven in one field to an underexplored adjacent field',
  'bottleneck removal: identify a specific step that limits performance/scale and redesign it directly',
  'evaluation-gap fill: existing methods claim success but are evaluated on a narrow/unrealistic benchmark; propose a harder or more faithful evaluation and the method to pass it',
  'combination-with-constraint: combine two known techniques under a new resource/latency/safety constraint',
  'failure-mode-driven: start from a well-documented failure mode of existing systems and design directly against it',
  'data-centric reframing: same architecture, but a new data collection/curation/labeling strategy changes what is learnable',
  'scaling-law probe: test whether a known finding holds at a different scale (much smaller, much larger, different modality)',
  'human-in-the-loop redesign: replace a fully automated step with a lightweight human signal to fix a specific weakness',
  'synthesis method: combine multiple existing approaches into a unified framework (flagged by 2607.01233 as an LLM-overused pattern — use sparingly)',
  'bridge opportunity: connect two previously-separate subfields (also flagged as LLM-overused — use sparingly, prefer the patterns above when possible)'
]

const OPPORTUNITY_PATTERNS = ['gap-framing', 'bridge', 'bottleneck', 'evaluation-critique', 'synthesis', 'scaling-probe']
const RESEARCH_PARADIGMS = ['empirical', 'theoretical', 'benchmark-construction', 'systems-engineering', 'human-study']

function buildPrompt({ evidence, topic, mode }) {
  const evidenceBlock = evidence
    .map((p, i) => `[${i + 1}] "${p.title}" (${p.year ?? 'n.d.'})\n${(p.abstract || p.summary || '').slice(0, 600)}`)
    .join('\n\n')

  const patternsBlock = IDEATION_PATTERNS.map((p, i) => `${i + 1}. ${p}`).join('\n')

  const instructionForMode =
    mode === 'papers'
      ? `Generate NEW research ideas that build on, extend, or critique the specific papers below. Every idea must clearly reference which paper(s) [n] it is grounded in.`
      : `The user's research topic is: "${topic}". Using the evidence papers below as grounding context (either directly relevant or adjacent), generate NEW research ideas addressing this topic.`

  return `You are a research-ideation assistant. Your methodology must follow these principles:
1. EVIDENCE-GROUNDED: every idea must be traceable to specific evidence papers, not invented from nothing.
2. PATTERN-GUIDED: pick one of the ideation pattern types below that best fits each idea (do not just pick "synthesis" or "bridge" for every idea — those are known to be overused by LLMs and narrower than human research taste; prefer the more specific patterns when they fit).
3. DIFFERENTIATE: explicitly state why existing work (the evidence papers) does not already solve this.
4. SELF-TAG: for each idea, output an "opportunityPattern" (one of: ${OPPORTUNITY_PATTERNS.join(', ')}) and a "researchParadigm" (one of: ${RESEARCH_PARADIGMS.join(', ')}) describing its shape — be honest, do not default to the same tags every time.

${instructionForMode}

Evidence papers:
${evidenceBlock}

Ideation pattern vocabulary (pick the best-fit type per idea, referenced by number):
${patternsBlock}

Generate exactly 3 distinct ideas. Respond with ONLY a JSON array (no markdown fences, no prose), where each element has this exact shape:
{
  "title": "short idea title",
  "summary": "one-paragraph pitch (2-3 sentences)",
  "fullText": "3-5 paragraphs: problem framing, proposed approach, evaluation plan, key risks",
  "generatedFromIndices": [1, 2],
  "ideationPattern": "<one of the pattern descriptions above, by its keyword e.g. 'bottleneck removal'>",
  "opportunityPattern": "<one of: ${OPPORTUNITY_PATTERNS.join(', ')}>",
  "researchParadigm": "<one of: ${RESEARCH_PARADIGMS.join(', ')}>",
  "differentiation": "one sentence: why existing work doesn't already do this"
}`
}

const CHAT_TIMEOUT_MS = 30000 // LLM generations legitimately take longer than a simple GET; generous but bounded

async function callChat(prompt) {
  const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.85,
      response_format: { type: 'json_object' }
    })
  }, CHAT_TIMEOUT_MS)
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`LLM chat completion failed (${res.status}): ${errText.slice(0, 300)}`)
  }
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('LLM response had no content')
  return content
}

// Some models wrap JSON arrays in an object when response_format is
// json_object (which requires a top-level object, not array). We ask for
// an array in the prompt but defensively unwrap {"ideas": [...]} shapes too.
function parseIdeasResponse(raw) {
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('LLM returned invalid JSON for ideas')
  }
  if (Array.isArray(parsed)) return parsed
  const arrayField = Object.values(parsed).find((v) => Array.isArray(v))
  if (arrayField) return arrayField
  throw new Error('LLM response did not contain an ideas array')
}

// evidence: array of paper-like nodes {title, year, abstract|summary}
// mode: 'topic' | 'papers'
// topic: string, required when mode==='topic'
export async function generateIdeas({ evidence, mode, topic }) {
  if (!hasLlmProvider()) {
    throw new Error(
      'NO_LLM_PROVIDER: idea generation requires OPENAI_API_KEY to be set on the server. ' +
      'Edge/similarity computation can run without it (keyword fallback), but generating new ideas cannot.'
    )
  }
  if (!evidence || evidence.length === 0) {
    throw new Error('NO_EVIDENCE: at least one evidence paper is required to ground idea generation')
  }

  // MOCK MODE: return deterministic mock ideas through the SAME output
  // contract as the real path below, skipping the network call entirely.
  if (MOCK_LLM && !OPENAI_API_KEY) {
    return mockIdeas({ evidence, mode, topic })
  }

  const prompt = buildPrompt({ evidence, topic, mode })
  const raw = await callChat(prompt)
  const ideas = parseIdeasResponse(raw)

  return ideas.map((idea) => {
    const generatedFrom = (idea.generatedFromIndices || [])
      .map((i) => evidence[i - 1]?.id)
      .filter(Boolean)
    return {
      title: idea.title || 'Untitled idea',
      summary: idea.summary || '',
      fullText: idea.fullText || idea.summary || '',
      generatedFrom: generatedFrom.length > 0 ? generatedFrom : [evidence[0].id],
      ideationPattern: idea.ideationPattern || 'unspecified',
      opportunityPattern: OPPORTUNITY_PATTERNS.includes(idea.opportunityPattern) ? idea.opportunityPattern : 'gap-framing',
      researchParadigm: RESEARCH_PARADIGMS.includes(idea.researchParadigm) ? idea.researchParadigm : 'empirical',
      differentiation: idea.differentiation || ''
    }
  })
}

export { OPPORTUNITY_PATTERNS, RESEARCH_PARADIGMS }
