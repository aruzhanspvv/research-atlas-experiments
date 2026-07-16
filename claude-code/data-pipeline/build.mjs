// Curation + assembly step of the offline pipeline:
//   fetchPapers.mjs  ->  data-pipeline/raw/papers.json   (real papers, arXiv + HF Daily Papers)
//   build.mjs (this)  ->  src/data/{stars,edges,dust}.json (no pos yet)
//   ../tools/layout.mjs -> fills in pos.{galaxy,timeline,novelty} via force layout
//
// Ideas below were authored by reading the fetched abstracts and following the
// evidence-grounded ideation pattern from arXiv:2607.04439 (bottleneck -> precedent
// -> differentiation -> prior-art check) and the novelty framing from arXiv:2607.01233.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const raw = JSON.parse(await readFile('data-pipeline/raw/papers.json', 'utf8'))
const allRaw = new Map()
Object.values(raw).flat().forEach((p) => {
  if (!allRaw.has(p.id)) allRaw.set(p.id, p)
})

function oneLiner(id, fallback) {
  const p = allRaw.get(id)
  if (!p) return fallback ?? ''
  const first = p.summary.split(/(?<=[.!?])\s+/)[0]
  return first.length > 220 ? `${first.slice(0, 217)}...` : first
}

function yearFracOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return y + (m - 1) / 12 + (d - 1) / 365
}

// —— Branch -> curated paper id list (all real arXiv ids fetched above) ——
const PAPERS_BY_BRANCH = {
  'llm-agents': [
    '2607.13591', '2607.13683', '2607.13474', '2607.13104', '2607.13884',
    '2607.13285', '2607.11250', '2607.13988', '2607.12747', '2607.07702'
  ],
  'reasoning-alignment': [
    '2607.09786', '2607.13753', '2607.11881', '2607.08046', '2607.13918',
    '2607.05394', '2607.13124', '2607.12395', '2607.00397', '2607.14051'
  ],
  'generative-vision': [
    '2607.14088', '2607.13431', '2605.16147', '2607.13125', '2607.13927',
    '2607.11594', '2607.11885', '2607.11886', '2607.14076', '2607.13770'
  ],
  'embodied-robotics': [
    '2607.13926', '2607.13960', '2607.14047', '2607.13818', '2607.13653',
    '2607.11643', '2607.10383', '2607.10350', '2607.09701', '2607.06701'
  ],
  'multimodal-foundation': [
    '2607.13639', '2607.11562', '2607.10400', '2607.12450', '2607.08317',
    '2607.11862', '2607.12752', '2607.13705', '2603.28583', '2607.07470'
  ],
  'learning-theory-optim': [
    '2607.13749', '2607.12438', '2607.10681', '2607.11289', '2607.10430',
    '2607.13414', '2607.12501', '2607.14018', '2607.13402', '2607.09202'
  ],
  'neuro-inspired-computing': [
    '2607.14086', '2607.11445', '2607.13584', '2607.11065', '2607.12403',
    '2607.09211', '2607.09025', '2607.09480', '2607.09889', '2607.11079'
  ]
}

// influence: rough hand-tier (3 = flagship/system paper worth a bright star, 2 = solid
// benchmark/method paper, 1 = supporting/niche paper). Ideas are always 4 (brightest, pulsing).
const FLAGSHIP = new Set([
  '2607.13591', '2607.13104', '2607.09786', '2607.11881', '2607.12395',
  '2607.14088', '2607.13431', '2607.11594', '2607.13926', '2607.11643',
  '2607.13639', '2607.11562', '2607.13749', '2607.12438', '2607.14086',
  '2607.09025', '2607.14047', '2607.13285'
])

function buildPapers() {
  const papers = []
  for (const [branch, ids] of Object.entries(PAPERS_BY_BRANCH)) {
    ids.forEach((id) => {
      const p = allRaw.get(id)
      if (!p) throw new Error(`missing fetched paper ${id}`)
      const yearFrac = yearFracOf(p.published)
      papers.push({
        id: `paper-${id}`,
        type: 'paper',
        branch,
        year: Math.floor(yearFrac),
        yearFrac,
        influence: FLAGSHIP.has(id) ? 3 : 2,
        frontier: false,
        noveltyExp: 0,
        title: p.title,
        authors: p.authors,
        venue: 'arXiv',
        arxivId: id,
        url: p.url,
        oneLiner: oneLiner(id),
        relatedIdeas: []
      })
    })
  }
  return papers
}

// —— Ideas: authored per arXiv:2607.04439's pattern (bottleneck, precedent, differentiation,
// prior-art collision check) and grounded in 3 real papers each. ——
const IDEAS = [
  {
    id: 'idea-verifiable-memory-audit', branch: 'llm-agents', noveltyScore: 78,
    title: 'Verifiable Memory Audits for Self-Evolving Agent Harnesses',
    groundedIn: ['paper-2607.13591', 'paper-2607.13884', 'paper-2607.13285'],
    gap: "Agent harnesses now edit their own memory and skill libraries over long horizons, but nothing checks whether a memory write actually caused the downstream improvement it's credited for.",
    hypothesis: 'Treat each memory write as a causal claim and verify it before committing.',
    method: 'Pair each memory write with a shadow rollout that ablates it, score the causal lift, gate the commit on a lift threshold, and log the audit trail in the harness handbook\'s editable diff format.',
    differentiation: "Prior work manages what to store or how to read a harness's own memory diffs; none of it verifies that a stored memory unit actually produced the credited outcome before committing it long-term.",
    priorArt: 'Closest precedent is one-shot error correction via experience graphs, which corrects after failure but never audits successes before they are baked in.'
  },
  {
    id: 'idea-multiagent-explore-incentive', branch: 'llm-agents', noveltyScore: 71,
    title: "Exploration Bonuses for Multi-Agent LLM Teams That Won't Explore Each Other",
    groundedIn: ['paper-2607.11250', 'paper-2607.13988', 'paper-2607.13683'],
    gap: 'Multi-agent LLM teams default to premature consensus instead of covering the hypothesis space, and turn-level credit assignment has no notion of "novel contribution relative to teammates."',
    hypothesis: "Add an inter-agent novelty bonus, scaled by distance from teammates' recent actions, to the turn-level credit signal.",
    method: "Embed each turn's action, track a running teammate-action centroid per role, add a bonus proportional to distance from that centroid into the turn-level credit signal, and anneal the bonus as consensus becomes warranted.",
    differentiation: "Existing turn-credit methods score usefulness to the task outcome only; they never compare an agent's action against its teammates' recent action distribution.",
    priorArt: 'The "fail to explore each other" paper diagnoses this failure mode via behavioral analysis but proposes no training-time fix.'
  },
  {
    id: 'idea-monitorability-preserving-rl', branch: 'reasoning-alignment', noveltyScore: 83,
    title: 'Monitorability-Constrained Length Penalties for Chain-of-Thought RL',
    groundedIn: ['paper-2607.09786', 'paper-2607.13753', 'paper-2607.08046'],
    gap: "Length-penalized RL compresses reasoning traces and quietly strips the tokens a monitor needs to catch hidden influences — accuracy metrics never measured monitorability, so this goes undetected.",
    hypothesis: 'Add a monitorability term to the RL reward, alongside the length penalty, so compression only happens where it does not erase evidence a monitor needs.',
    method: 'Train a small hint-influence probe on paired (trace, hint-used) data, use its predicted faithfulness score as a second reward term traded off against the length penalty, and evaluate on the same MMLU-Pro-R and transfer suite.',
    differentiation: 'The source paper measures the compression-monitorability frontier as an empirical finding; it does not propose a training objective that targets the frontier directly.',
    priorArt: 'Length-penalty RL and post-hoc faithfulness probing both exist separately; combining the probe as an online reward signal, rather than an offline eval, is the gap.'
  },
  {
    id: 'idea-forecaster-abstention', branch: 'reasoning-alignment', noveltyScore: 69,
    title: 'Calibrated Abstention for LLM Forecasters Using Internal Representations',
    groundedIn: ['paper-2607.08046', 'paper-2607.14051', 'paper-2607.05394'],
    gap: "Forecasters' internal representations already encode calibration signal the surface text doesn't report, and replay benchmarks expose systematic overconfidence, but nothing turns that probed signal into an actionable abstention policy at inference time.",
    hypothesis: 'A probe-and-abstain head, distilled weak-to-strong from replay labels, lets a forecaster decline exactly when its internal signal disagrees with its stated confidence.',
    method: 'Extract calibration probe features, distill an abstain/answer head using replayed market outcomes as weak labels, and evaluate the coverage-vs-accuracy trade-off against plain confidence thresholding.',
    differentiation: 'Probing work measures the gap between internal state and stated confidence descriptively; it stops short of an inference-time decision rule built on that gap.',
    priorArt: 'Confidence thresholding on stated probabilities is the standard baseline; this bypasses it by reading the model\'s internal disagreement with itself.'
  },
  {
    id: 'idea-controllable-video-worldmodel', branch: 'generative-vision', noveltyScore: 74,
    title: 'Action-Conditioned Representation Autoencoders for Long-Horizon Game World Models',
    groundedIn: ['paper-2607.14088', 'paper-2607.14076', 'paper-2607.11594'],
    gap: 'Representation-autoencoder video models generate strong long rollouts, and separate work argues world models should be structured as game engines with explicit state — but nobody has plugged an action-conditioned state bottleneck into a representation-autoencoder\'s latent space.',
    hypothesis: "Inserting a discrete, action-conditioned state token into the video autoencoder's latent sequence gives it explicit, editable state without sacrificing sample quality.",
    method: "Add a small VQ bottleneck conditioned on the action token at each latent step, train jointly with the autoencoder's reconstruction loss, and evaluate long-horizon consistency on a multi-scene navigation benchmark.",
    differentiation: 'The autoencoder work targets generation fidelity; the world-model position paper argues for state structure but doesn\'t build on a representation-autoencoder backbone — this is the missing bridge.',
    priorArt: 'Game-engine-style world models with explicit state exist for pixel-space or tokenized backbones; none use a representation-autoencoder\'s continuous latent as the substrate.'
  },
  {
    id: 'idea-reward-model-personalization', branch: 'generative-vision', noveltyScore: 66,
    title: 'Zero-Shot MLLM Reward Models as Personalization Judges for Text-to-Image Identity Tuning',
    groundedIn: ['paper-2607.11886', 'paper-2607.11885', 'paper-2607.13125'],
    gap: 'Identity-personalization tuning still relies on CLIP-similarity or face-embedding losses that reward surface resemblance rather than "is this actually the same subject," while zero-shot MLLM reward models already judge generation quality without task-specific training.',
    hypothesis: 'Replacing the identity loss with a zero-shot MLLM reward-model score catches identity drift that embedding-distance losses miss.',
    method: "Use a unified model's own understanding head as the reward-model judge during personalization fine-tuning, backprop through a reward-weighted objective, and compare identity retention against embedding-loss baselines.",
    differentiation: 'Existing identity losses are metric-based and blind to compositional errors; MLLM reward models are validated for general alignment but not wired into personalization loops specifically.',
    priorArt: 'Reward-model-guided fine-tuning is established for general T2I alignment; using it specifically as an identity-drift detector inside personalization tuning is new.'
  },
  {
    id: 'idea-semantic-spatial-transfer', branch: 'embodied-robotics', noveltyScore: 80,
    title: 'Cross-Embodiment Transfer via Decoupled Semantic/Spatial VLA Streams',
    groundedIn: ['paper-2607.13926', 'paper-2607.11643', 'paper-2607.10383'],
    gap: 'Decoupling semantic and spatial streams improves single-embodiment VLA performance, but unified embodied-synthesis and navigation models still train one entangled representation per embodiment — nothing transfers the semantic stream across a manipulator and a navigation-only robot.',
    hypothesis: 'The semantic stream from a decoupled VLA should transfer near zero-shot across embodiments with completely different spatial streams, since semantics is embodiment-agnostic by construction.',
    method: "Pretrain the semantic stream on the manipulation corpus, freeze it, attach it to the navigation model's spatial stream, fine-tune only the fusion layer, and measure task success on held-out instructions with novel object references.",
    differentiation: 'Unified embodied-synthesis models share one backbone across embodiments; this argues for explicit stream-level reuse of just the semantic half.',
    priorArt: 'Cross-embodiment transfer usually retrains the whole backbone; stream-level reuse specifically for the semantic half is untested.'
  },
  {
    id: 'idea-egocentric-dexterity-benchmark-loop', branch: 'embodied-robotics', noveltyScore: 63,
    title: 'Closing the Loop Between Egocentric Demonstration and Industrial Dexterity Benchmarks',
    groundedIn: ['paper-2607.09701', 'paper-2607.13960', 'paper-2607.13818'],
    gap: 'Egocentric-video dexterity systems, industrial dexterity benchmarks, and agentic-RL execution robustness are each measured in their own setting — no pipeline lets an egocentric policy get benchmarked, and then hardened, on an industrial suite in one loop.',
    hypothesis: "Policies distilled from egocentric demonstrations, benchmarked directly and then patched with RL fine-tuning on the benchmark's own failures, close the sim-to-industrial gap faster than benchmark-native training from scratch.",
    method: "Distill an egocentric policy on the benchmark's task set, run it zero-shot to collect failure trajectories, apply agentic RL fine-tuning targeted only at those failures, and compare sample efficiency against from-scratch training.",
    differentiation: 'Each source work evaluates within its own setting; none tests whether egocentric transfer plus targeted RL patching beats training a benchmark-native policy from zero.',
    priorArt: "Sim-to-real dexterity transfer is well studied; using an industrial benchmark's own failures as the RL curriculum for an egocentric policy is not."
  },
  {
    id: 'idea-hallucination-aware-doc-ocr', branch: 'multimodal-foundation', noveltyScore: 72,
    title: 'Hallucination-Localizing OCR for Long-Context Visual Documents',
    groundedIn: ['paper-2607.13639', 'paper-2607.10400', 'paper-2607.12752'],
    gap: 'Document-AI OCR is getting stronger on long-context visual documents, and hallucination mitigation exists for video generation, but no document-OCR model localizes where in a transcribed page it is likely hallucinating.',
    hypothesis: 'Adapting a video hallucination-localization signal to token-level regions of a transcribed page lets an OCR model flag exact spans as low-trust.',
    method: 'Repurpose the consistency-scoring mechanism over document layout regions instead of video frames, train a per-span trust head on controlled long-context documents, and report localized hallucination precision/recall as a new benchmark axis.',
    differentiation: 'Document OCR benchmarks currently score end-to-end transcription accuracy only; none report a spatial hallucination map the way video work already does for a different modality.',
    priorArt: 'Hallucination localization is established in video/spatio-temporal generation; porting the mechanism to static long-context document transcription is untested.'
  },
  {
    id: 'idea-chart-qa-evidence-audit', branch: 'multimodal-foundation', noveltyScore: 68,
    title: 'Evidence-Audited Chart QA: Making Misleading-Chart Detectors Explain Their Own Trust',
    groundedIn: ['paper-2603.28583', 'paper-2607.11862', 'paper-2607.08317'],
    gap: 'Dual-path agentic chart-QA frameworks detect when a chart is misleading, and evidence-backed video QA forces models to cite the exact evidence span for an answer, but no chart-QA system explains why it flagged a chart as misleading.',
    hypothesis: 'Requiring the chart-QA agent to cite the specific visual region justifying its verdict, using the same evidence-citation format as evidence-backed video QA, reduces blind spots because ungrounded verdicts get forced to admit uncertainty.',
    method: 'Add an evidence-span output head to the dual-path chart-QA agent, supervise it with synthetic ground-truth distortion regions, and evaluate whether citation-forced answers reduce specific blind-spot categories.',
    differentiation: "The mirage paper detects misleadingness but doesn't require a localized justification; evidence-backed QA requires justification but only in the video domain.",
    priorArt: 'Evidence citation is established for video QA; chart QA has verdict detection but not evidence-forced citation.'
  },
  {
    id: 'idea-grokking-rank-diagnostic', branch: 'learning-theory-optim', noveltyScore: 76,
    title: 'A Unified Spectral Early-Warning Signal for Grokking and Memorization',
    groundedIn: ['paper-2607.13749', 'paper-2607.12438', 'paper-2607.14018'],
    gap: 'Grokking is characterized as reaching an algebraically-representable regime, memorization is diagnosed via Fisher-rank inflation, and architectural rank pathologies are studied as a depth phenomenon — three spectral stories about rank that have never been read as one signal on the same training run.',
    hypothesis: 'A combined spectral statistic — effective Fisher rank alongside the algebraic-representability measure — separates "about to grok" from "about to memorize" days before validation loss shows it.',
    method: "Instrument both statistics during training on the grokking paper's exactly-solvable model and on a label-noise memorization benchmark, check whether the joint trajectory separates the regimes earlier than either statistic alone, and package it as a training-time diagnostic.",
    differentiation: 'Each source paper isolates one rank-related phenomenon in its own controlled setting; none cross-references the others\' spectral statistic as a joint diagnostic.',
    priorArt: 'Rank-based diagnostics for grokking and for memorization exist separately; a joint early-warning signal spanning both does not.'
  },
  {
    id: 'idea-fairness-bandit-transfer', branch: 'learning-theory-optim', noveltyScore: 70,
    title: 'Transferable Fairness Budgets Across Non-Stationary Bandit Deployments',
    groundedIn: ['paper-2607.13402', 'paper-2607.13414', 'paper-2607.09202'],
    gap: 'The minimax price-of-fairness result is derived for a single fixed bandit deployment, two-time-scale stochastic approximation gives a convergence guarantee for a different non-stationary setting, and continual learning separately studies how new tasks interfere with retained ones — nobody has asked whether a fairness budget survives redeployment on a shifted arm distribution.',
    hypothesis: 'A fairness budget, reused as a warm start across a sequence of shifted deployments, retains most of its guarantee if the deployments satisfy a bounded-interference condition analogous to catastrophic-forgetting bounds.',
    method: "Formalize an interference bound between successive arm distributions using the continual-learning retention metric, bound the fairness budget's degradation under that bound, and validate empirically on a shifted-arm simulation.",
    differentiation: 'The price-of-fairness result is single-deployment; this treats the fairness guarantee itself as a transferable, degradable quantity.',
    priorArt: 'Fairness-in-bandits and continual-learning interference are mature separately; treating a fairness guarantee as transferable is new.'
  },
  {
    id: 'idea-decoding-transfer-loop', branch: 'neuro-inspired-computing', noveltyScore: 81,
    title: 'Self-Supervised Decoder Transfer Between Invasive and Event-Based Neural Recordings',
    groundedIn: ['paper-2607.14086', 'paper-2607.11445', 'paper-2607.13584'],
    gap: 'Self-supervised multi-session pretraining generalizes spike-tokenized decoders across sessions of the same modality, event-based neuroprosthetic decoding uses a different signal representation, and spiking-network place recognition shows rate-encoding transfers to a third, unrelated task — none of these self-supervised representations have been tested for cross-modality transfer.',
    hypothesis: 'A spike-tokenized encoder pretrained self-supervised on invasive recordings gives a better initialization for an event-based neuroprosthetic decoder than training from scratch.',
    method: 'Pretrain the spike-tokenized encoder self-supervised, freeze early layers, fine-tune a small adapter on event-based data, and compare motor-decoding accuracy and sample efficiency against modality-native training.',
    differentiation: 'The source papers each validate self-supervised transfer within one recording modality; cross-modality transfer between invasive and event-based decoding is untested.',
    priorArt: 'Within-modality multi-session pretraining is established; cross-modality initialization between invasive and event-based decoding has not been reported.'
  },
  {
    id: 'idea-artificial-life-scientist-loop', branch: 'neuro-inspired-computing', noveltyScore: 85,
    title: 'Using Self-Replicating Digital Organisms as a Testbed for AI-Scientist Benchmarks',
    groundedIn: ['paper-2607.09211', 'paper-2607.09025', 'paper-2607.11079'],
    gap: 'Digital-primordial-soup experiments produce open-ended dynamics with fully known ground truth, evolutionary computation is being repositioned as a scientific-discovery tool, and AI-scientist benchmarks need verifiable ground truth — but those benchmarks currently use human-authored tasks where full ground truth is unknown even to the designer.',
    hypothesis: "Running an AI-scientist pipeline against a digital-primordial-soup substrate, where the evolutionary rules are known exactly, gives a benchmark with unambiguous ground truth for whether the AI scientist's discovered law matches the real generative mechanism.",
    method: "Instrument the simulator to log its exact generative rules, run the AI-scientist pipeline to propose hypotheses about observed population dynamics, and score discovered hypotheses against the logged ground-truth rules rather than against human judgment.",
    differentiation: 'Existing AI-scientist benchmarks use real scientific domains where full ground truth is unknown even to the benchmark designer; an artificial-life substrate with fully known rules removes that ambiguity.',
    priorArt: 'AI-scientist benchmarks on real-world data and artificial-life open-endedness research are both active but have not been combined into a ground-truth-verifiable discovery benchmark.'
  }
]

function buildIdeas() {
  return IDEAS.map((idea) => ({
    id: idea.id,
    type: 'idea',
    branch: idea.branch,
    year: 2026,
    yearFrac: 2026.5,
    influence: 4,
    frontier: true,
    noveltyExp: idea.noveltyScore / 10,
    noveltyScore: idea.noveltyScore,
    title: idea.title,
    oneLiner: idea.hypothesis,
    gap: idea.gap,
    method: idea.method,
    differentiation: idea.differentiation,
    priorArt: idea.priorArt,
    groundedIn: idea.groundedIn
  }))
}

function buildDust() {
  const used = new Set(Object.values(PAPERS_BY_BRANCH).flat())
  const branchKeys = Object.keys(PAPERS_BY_BRANCH)
  // crude keyword router so leftover fetched papers still land near a plausible branch
  const KEYWORDS = {
    'llm-agents': ['agent', 'harness', 'tool', 'memory'],
    'reasoning-alignment': ['reason', 'align', 'faithful', 'safety', 'rl', 'distill', 'confidence'],
    'generative-vision': ['diffusion', 'generat', 'image', 'video', 'gan'],
    'embodied-robotics': ['robot', 'manipulat', 'navigat', 'vla', 'uav', 'drone'],
    'multimodal-foundation': ['multimodal', 'vision-language', 'ocr', 'document', 'vqa', 'clip'],
    'learning-theory-optim': ['theory', 'optimiz', 'bandit', 'converg', 'grokking', 'minimax', 'gradient'],
    'neuro-inspired-computing': ['spik', 'neural decod', 'evolut', 'neuro', 'brain', 'bio']
  }
  function routeBranch(text) {
    const low = text.toLowerCase()
    for (const [branch, kws] of Object.entries(KEYWORDS)) {
      if (kws.some((k) => low.includes(k))) return branch
    }
    return branchKeys[Math.abs(hashCode(text)) % branchKeys.length]
  }
  function hashCode(s) {
    let h = 0
    for (let i = 0; i < s.length; i += 1) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
    return h
  }
  const dust = []
  allRaw.forEach((p, id) => {
    if (used.has(id)) return
    const yearFrac = yearFracOf(p.published)
    dust.push({
      id: `dust-${id}`,
      title: p.title,
      branch: routeBranch(`${p.title} ${p.summary.slice(0, 200)}`),
      year: Math.floor(yearFrac),
      yearFrac
    })
  })
  return dust
}

const papers = buildPapers()
const ideas = buildIdeas()
const paperById = new Map(papers.map((p) => [p.id, p]))
ideas.forEach((idea) => {
  idea.groundedIn.forEach((pid) => {
    paperById.get(pid)?.relatedIdeas.push(idea.id)
  })
})

const stars = [...papers, ...ideas]
const edges = ideas.flatMap((idea) =>
  idea.groundedIn.map((pid) => ({ from: idea.id, to: pid, type: 'derivation' }))
)
const dust = buildDust()

await mkdir('src/data', { recursive: true })
await writeFile('src/data/stars.json', `${JSON.stringify(stars, null, 2)}\n`)
await writeFile('src/data/edges.json', `${JSON.stringify(edges, null, 2)}\n`)
await writeFile('src/data/dust.json', `${JSON.stringify(dust, null, 2)}\n`)

console.log(`stars: ${stars.length} (${papers.length} papers + ${ideas.length} ideas)`)
console.log(`edges: ${edges.length}`)
console.log(`dust: ${dust.length}`)
