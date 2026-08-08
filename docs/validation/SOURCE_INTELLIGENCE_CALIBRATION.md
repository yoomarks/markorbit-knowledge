# Source Intelligence Calibration

## Purpose

This calibration loop measures whether the current **operational prioritization** produced by Source Intelligence is directionally aligned with explicit human professional judgment across a heterogeneous real-source cohort.

It does **not** validate legal truth, source correctness, professional quality, or MGSN eligibility.

The current loop is:

`Human-maintained cohort → bounded live Discovery → explicit isolated acceptance → Website Source/Profile + Source Graph → explicit calibration labels → Source Intelligence assessment → calibration report`

## Frozen boundaries

1. `operationalTier` remains an operations signal, never a legal authority rating.
2. `AuthorityLevel` in the cohort manifest is an explicit human calibration input. It is never inferred from Tier.
3. Candidate acceptance in calibration occurs only inside an isolated registry and is explicitly marked as calibration review.
4. Acceptance must leave the default CollectionPlan `PAUSED`.
5. This calibration stage does not authorize or dispatch collection.
6. A failed or robots-restricted source remains visible in the report; failures are not silently removed to improve the score.
7. All accepted WEB Sources must use `crawl4ai-web@1.1.0`.
8. The cohort does not create cross-Source Person/Organization identity resolution.

## Cohort

The first cohort contains primary official trademark/IP sources, an industry association, professional IP/trademark firms, and an industry publication. It is intentionally heterogeneous so the evaluator can be checked against a human ranking rather than against one source class only.

The manifest is:

`config/source-intelligence-calibration-cohort.json`

Each item includes:

- canonical seed URL;
- explicit Source category;
- explicit AuthorityLevel;
- jurisdiction and language labels;
- `humanPriority` from 1–5.

`humanPriority` is only a calibration expectation. It is not persisted as platform authority or truth.

## Metrics

The calibration report records, per successfully observed Source:

- Discovery candidate count and selected provenance;
- production connector version;
- Source Graph/evidence counts visible to the evaluator;
- operational Tier and priority score;
- six Source Intelligence dimensions;
- recommended rescan signal;
- explicit AuthorityLevel used for the assessment.

The cohort summary includes:

- success/failure counts;
- Tier distribution;
- average machine score by explicit AuthorityLevel;
- machine ordering;
- Spearman correlation between human priority and machine priority score.

The correlation is diagnostic, not a release gate yet. The first real runs are intended to reveal evaluator bias before thresholds are frozen.

## Running locally

Start the admin control plane against an isolated registry, then run:

```bash
pnpm calibrate:source-intelligence -- \
  --base-url http://127.0.0.1:3000 \
  --limit 12 \
  --min-success 6
```

The reusable GitHub Actions workflow is `Source Intelligence Calibration`.

## Interpretation

A good calibration run should not simply force official Sources into Tier A. The useful signal is whether the evaluator explains why one Source should be revisited or collected before another while preserving the distinction between:

- authority;
- trademark relevance;
- freshness;
- evidenceability;
- novelty;
- acquisition cost.

If the first cohort shows poor rank alignment, the next step is evaluator calibration, not widening autonomous behavior.

## Next gate

After discovery-graph calibration is stable, the next calibration stage adds bounded real collection evidence for a smaller subset and compares the same Sources before and after RawArtifact evidence. Only after that should Source Intelligence begin influencing scheduling recommendations more strongly.
