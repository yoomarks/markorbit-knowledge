# Source Intelligence D2.3 Evidence Calibration Baseline — 2026-08-08

Status: observed real-source baseline

## Proof

GitHub Actions run: `31255796945`

Result: **PASS**

The run used an isolated Knowledge registry and artifact store and exercised the real governed chain:

`Seed → bounded Discovery → explicit calibration acceptance → BEFORE Source Intelligence assessment → explicit collection authorization → crawl4ai-web@1.1.0 → HTML + Markdown RawArtifacts → deterministic Source Graph extraction → AFTER Source Intelligence assessment → boundary verification`

The Worker process-tree cleanup was also verified: the calibration script completed normally after the real crawl instead of leaving inherited child-process pipes alive.

## Acquisition boundary

For every source:

- collection was explicitly authorized after the BEFORE assessment;
- connector was `crawl4ai-web@1.1.0`;
- `maxDepth = 0`;
- `maxItems = 1`;
- `respectRobots = true`;
- attachments were disabled;
- output contained HTML and Markdown RawArtifacts;
- one HTML RawArtifact was projected into the source-local Source Graph;
- no recurring production schedule was created;
- the run did not verify legal truth or professional identity.

## Results

| Source | Authority input | BEFORE | AFTER | Score delta | RawArtifacts | Raw-provenance node delta | Graph node delta |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| USPTO Trademarks | PRIMARY_OFFICIAL | 32 / D | 64 / B | +32 | +2 | +115 | +115 |
| Finnegan | PROFESSIONAL | 30 / D | 60 / B | +30 | +2 | +31 | +30 |
| INTA | INDUSTRY | 29 / D | 61 / B | +32 | +2 | +83 | +82 |

Cohort totals:

- attempted: **3**
- successful: **3**
- failed: **0**
- average BEFORE score: **30.33**
- average AFTER score: **61.67**
- average score delta: **+31.33**
- Tier transitions: **3/3 D → B**

## Dimension comparison

### USPTO Trademarks

| Dimension | BEFORE | AFTER |
| --- | ---: | ---: |
| Relevance | 34 | 34 |
| Authority Signal | 100 | 100 |
| Freshness | unknown | 95 |
| Evidenceability | 15 | 77 |
| Novelty | unknown | 100 |
| Acquisition Cost | unknown | 25 |

### Finnegan

| Dimension | BEFORE | AFTER |
| --- | ---: | ---: |
| Relevance | 34 | 34 |
| Authority Signal | 70 | 70 |
| Freshness | unknown | 95 |
| Evidenceability | 15 | 58 |
| Novelty | unknown | 100 |
| Acquisition Cost | unknown | 10 |

### INTA

| Dimension | BEFORE | AFTER |
| --- | ---: | ---: |
| Relevance | 34 | 34 |
| Authority Signal | 55 | 55 |
| Freshness | unknown | 95 |
| Evidenceability | 15 | 72 |
| Novelty | unknown | 100 |
| Acquisition Cost | unknown | 20 |

The `freshness` and `novelty` arithmetic deltas in the machine summary are `null` because the BEFORE values are intentionally unknown rather than zero. Their AFTER values are nevertheless explicitly observed and high-confidence: Freshness = 95 and Novelty = 100 for all three successful sources.

## Interpretation

This experiment isolates the semantic problem clearly.

The underlying source identity, explicit authority input, and measured Relevance did not change between BEFORE and AFTER. Only the system's evidence state changed. Despite that, each source gained roughly thirty priority points and every source moved from Tier D to Tier B after one bounded page acquisition.

Therefore the current v1 `priorityScore` is answering at least two different operational questions at once:

1. **How valuable is this source worth acquiring from?**
2. **How mature, fresh and provenance-backed is the evidence already acquired from it?**

Those questions have different product meanings and different operator actions. A source can be extremely important to collect while still having little acquired evidence. Conversely, a fully collected source can have mature evidence without being a high-value source for a specific professional objective.

## Architecture decision from D2.3

Do **not** change evaluator weights merely to make current Tier labels look more intuitive.

The next Source Intelligence protocol should separate the existing blended output into at least two explicit concepts:

### Source Value Priority

Purpose: prioritize where Knowledge should spend acquisition attention.

Should be driven primarily by source relevance/value signals, explicit governed authority, professional-domain fit, expected novelty/coverage value and acquisition cost/risk. Lack of previously acquired RawArtifacts must not by itself make an important official source look low-value.

### Evidence Maturity

Purpose: describe how ready the currently acquired evidence is for downstream use and refresh decisions.

Should be driven by immutable RawArtifact provenance, provenance coverage, freshness, observed change/novelty, successful acquisition history and related evidence-health signals.

These remain operational signals, not legal-truth scores.

## Preserved boundaries

The D2.3 result does not authorize Knowledge to:

- infer legal truth from freshness or provenance;
- infer AuthorityLevel automatically from a high score;
- globally resolve Organization or Person identities;
- auto-accept discovered sources;
- auto-run future collections;
- promote observed professionals to MGSN;
- treat Source Value Priority as professional quality or legal authority;
- treat Evidence Maturity as correctness of the underlying legal proposition.

## Next step

Design Source Intelligence vNext around the two-axis model:

`Source Value Priority × Evidence Maturity`

Keep the existing v1 assessment readable for compatibility while introducing separately versioned outputs and migration-safe operator semantics. Calibrate the two axes against the existing D2.2 and D2.3 real-source evidence before any autonomous scheduling policy consumes them.
