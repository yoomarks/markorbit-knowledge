# Source Intelligence Calibration Baseline — 2026-08-08

## Status

**Observed real-source baseline. Not a scorer release threshold.**

Live proof:

- workflow: `Agent Source Intelligence Calibration Live`;
- run: `31252469379`;
- cohort attempted: 12 real public sources;
- successful: 11;
- failed: 1;
- collection authorization: **not performed**;
- collection execution: **not performed**;
- accepted default plans remained `PAUSED`;
- successful WEB Sources used `crawl4ai-web@1.1.0`.

The run executed against an isolated Knowledge registry and used the same governed Discovery, candidate review, Source/Profile/Graph, Source update, and Source Intelligence APIs as the operator flow.

## Observed results

| Calibration group | Successful sources | Average machine priority |
| --- | ---: | ---: |
| PRIMARY_OFFICIAL | 3 | 32 |
| PROFESSIONAL | 6 | 30 |
| INDUSTRY | 2 | 29 |

Tier distribution:

- Tier A: 0
- Tier B: 0
- Tier C: 0
- Tier D: 11

Spearman rank correlation between explicit human calibration priority and machine priority score:

**0.7313**

Observed machine ordering:

1. USPTO Trademarks — 32
2. WIPO Trademarks — 32
3. UK Intellectual Property Office — 32
4. Finnegan — 30
5. Fish & Richardson — 30
6. Marks & Clerk — 30
7. Boult — 30
8. Murgitroyd — 30
9. Rouse — 30
10. International Trademark Association — 29
11. World Trademark Review — 29

EUIPO was the single failed source. Discovery returned no governed `DISCOVERED` candidate that remained on the manifest seed's normalized host boundary. This is recorded as a Discovery/canonical-host investigation item, not silently removed and not treated as an Intelligence scoring failure.

## What the baseline proves

### 1. Relative ranking has a useful first signal

The evaluator separated the explicit source classes in the expected broad direction:

`PRIMARY_OFFICIAL > PROFESSIONAL > INDUSTRY`

The rank correlation of `0.7313` is strong enough to justify continuing calibration, but it is not sufficient to freeze weights or thresholds.

### 2. Absolute Tier resolution is not useful before collection evidence

All 11 successful Sources landed in Tier D even though their priority scores differed.

This behavior is explainable from evaluator v1.0.0 rather than being a runtime fault. Current weighted priority is dominated by:

- Relevance: 40%
- Evidenceability: 25%
- Freshness: 20%
- Novelty: 10%
- Authority signal: 5%

At the Discovery/Source Graph-only stage there are no RawArtifacts. Therefore:

- Freshness has no observed score;
- acquisition footprint is absent;
- Evidenceability falls to the low no-artifact-backed-evidence baseline;
- Authority remains deliberately a small explicit signal rather than a shortcut to legal truth.

This means the current `operationalTier` behaves partly like **evidence readiness/maturity**, not only like **source operational value**.

### 3. Do not fix this by making Authority dominate Tier

The baseline does **not** justify forcing official Sources into Tier A or materially increasing Authority weight merely to match human expectations.

Doing so would collapse two separate concepts:

- how authoritative/relevant a Source appears from explicit metadata and observed structure;
- how much provenance-backed evidence exists to support operational collection decisions.

The next validation should measure these separately before changing evaluator semantics.

### 4. INTA is a useful calibration disagreement

INTA had explicit human calibration priority 4 but machine score 29, below the professional-firm group at 30.

This is a useful disagreement, not automatically a scoring bug. The next stage should determine whether:

- the human calibration expectation is too coarse;
- category/relevance baseline is underweighting a high-value industry association;
- Source Graph topical coverage is insufficient at the bounded Discovery depth;
- or collected evidence changes the ordering naturally.

## Decision from this baseline

Do **not** tune evaluator weights in the calibration-harness PR.

Keep D2.2 focused on making calibration repeatable and auditable. The next controlled experiment should compare a small representative set **before vs. after bounded real collection**, for example:

- one primary official Source;
- one professional law-firm Source;
- one industry/association Source.

Measure changes in Freshness, Evidenceability, Novelty, total priority, and Tier after RawArtifact evidence exists.

Only then decide whether Source Intelligence needs two explicit outputs, such as:

- `sourceValuePriority` / operational value; and
- `evidenceMaturity` / evidence readiness;

or whether the existing single priority score can be calibrated without semantic ambiguity.

## Follow-up issue discovered

EUIPO host/canonical redirect handling should be investigated independently in Discovery. A fix must preserve domain-boundary and SSRF protections and must not broadly treat unrelated hosts as equivalent.
