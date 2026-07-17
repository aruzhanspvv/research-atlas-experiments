# Research-Idea Atlas — Novelty Methodology

This document is the long-form write-up of how the **novelty score** is computed
and why. The implementation lives in `src/lib/novelty.js`. The headline formula:

```
novelty = round(100 * (
    0.50 · d_jaccard                          // distance from grounding papers
  + 0.20 · (1 − exp(−E / 5))                  // evidence coverage (saturating)
  + 0.15 · opportunity_weight(α)              // penalise bridge-clustering
  + 0.15 · paradigm_weight(β)                 // penalise synthesis-clustering
))
```

where

- `d_jaccard` ∈ [0, 1]: mean pairwise Jaccard distance between the idea's
  top-K keywords and each grounding paper's top-K keywords.
- `E` ∈ [0, 10]: the number of supporting evidence quotes the LLM emitted
  (capped at 10 for the formula; more is fine).
- `α` ∈ {bridge, gap, limit, reframing}: opportunity pattern.
- `β` ∈ {synthesis, extension, novel-mechanism, new-domain}: research paradigm.

The LLM is asked to self-classify the idea into both axes and emit one of the
15 ResearchStudio-Idea patterns. The two bonus terms read those two answers and
weight them.

## Why this formula

The two real arXiv papers this methodology is grounded in:

| arXiv id | Title | What we borrow |
|---|---|---|
| **[2607.04439](https://arxiv.org/abs/2607.04439)** | *ResearchStudio-Idea: An Evidence-Grounded Research-Ideation Skill Suite from ML Conference Outcomes* (Zhao et al., 2026) | **Scoop-Check** (collision against prior art via keyword / abstract distance), **evidence-readiness** gate, the **15-pattern catalog** of reusable ideation patterns. |
| **[2607.01233](https://arxiv.org/abs/2607.01233)** | *Measuring the Gap Between Human and LLM Research Ideas* (Chen, Zhao, Cohan, 2026) | The **2-axis taste taxonomy** (opportunity pattern × research paradigm). Finding: LLM ideas cluster disproportionately on **bridge** opportunities and **synthesis** paradigms — i.e. the modes humans least often pick. We translate that finding into penalty weights. |

### Distance term (50% of the score)

This is the strongest signal. `d_jaccard` is the same family of distance
metric used by Scoop-Check in [2607.04439]: tokenise, drop stopwords,
top-K=20 keywords, Jaccard. We average across all grounding papers so an idea
that drifts away from one paper but stays close to another scores moderately.

We do **not** use embeddings. Jaccard on top-K keywords is robust, deterministic,
fast (no model load), and language-portable. A future revision could swap in
a learned distance (cosine of TF-IDF, or sentence-transformer) without changing
the rest of the formula.

### Evidence term (20%)

`1 − exp(−E/5)` is a saturating curve: 1 quote ≈ 0.18, 3 quotes ≈ 0.45,
5 quotes ≈ 0.63, 10 quotes ≈ 0.86. This rewards ideas that are well-grounded
in specific verbatim quotes from the input papers, as required by [2607.04439]'s
evidence-readiness gate. The cap at E=10 prevents LLM "fluent bloat" from
artificially boosting the score.

### Opportunity-pattern term (15%)

A direct translation of Chen et al.'s finding:

| Opportunity | Weight | Why |
|---|---|---|
| `bridge`      | 0.40  | LLMs over-cluster here → penalise to surface human-style ideas |
| `gap`         | 0.70  | Reasonable middle ground |
| `limit`       | 0.85  | Strong signal: extending a method's regime |
| `reframing`   | 1.00  | Highest bonus: recasts the problem in a new frame |

### Paradigm term (15%)

| Paradigm | Weight | Why |
|---|---|---|
| `synthesis`         | 0.50  | LLMs over-cluster here → penalise |
| `extension`         | 0.70  | Common but valuable |
| `novel-mechanism`   | 1.00  | Highest bonus: new causal lever |
| `new-domain`        | 0.95  | Strong signal: cross-field transfer |

## Defensive clamping

Every multiplicative term is clamped to `[0, 1]` before the final aggregation,
so a malformed pattern id or an empty grounding list cannot blow the score.
At `novelty = 0` and `novelty = 100` all shader inputs (radius, brightness,
sprite scale) are clamped before `exp()` / division, eliminating NaN risk.

## What we *don't* claim

The novelty score is a **calibrated heuristic**, not a measure of intellectual
merit. A high score means "this idea is far from the input papers in
vocabulary, brings several verbatim evidence quotes, and avoids the modes where
LLM taste is most predictable." It does **not** mean "this idea will work".
Use it as a quick read-across filter, not a gate.

## Cited in-app

The "About this methodology" button on every idea-card opens a dialog with the
two-line summary plus the two citations.
