# Source Intelligence Operator D2.1

Status: implementation baseline

## Purpose

D2.1 exposes the existing Source Intelligence D2 assessment to operators without widening its authority.

The operator loop is:

`SourceDefinition + Source Graph + RawArtifact → Assessment → Inspect / Compare → Human decision`

The UI may display and compare operational recommendations. It does not convert recommendations into execution authority.

## Operator surfaces

### Source detail

Each Source detail page exposes:

- operational tier A/B/C/D;
- priority score;
- six explainable dimensions;
- evidence snapshot;
- explicit AuthorityLevel beside the operational result;
- recommended human rescan review interval;
- an explicit operator action to create/reuse an assessment for current evidence.

### Source Intelligence workbench

The workbench loads a bounded cohort of Sources and their latest assessments. Operators can:

- compare current operational tiers and scores;
- distinguish operational tier from explicit AuthorityLevel;
- filter a cohort by tier or unassessed state;
- inspect evidence counts and review recommendations;
- explicitly assess/reassess one Source at a time;
- open the Source detail for deeper evidence review.

The initial cohort is deliberately bounded to 100 Sources. This supports calibration against USPTO and the first 10–20 professional websites without creating an unbounded registry scan.

## Invariants

1. **Operational tier is not legal authority.** Tier A means high operational collection priority under the current evaluator, not official status, legal correctness, reliability certification, or truth.
2. **Authority remains explicit.** The UI reads `SourceDefinition.authorityLevel`; it never derives or mutates AuthorityLevel from Source Intelligence.
3. **Unknown stays unknown.** An `UNKNOWN` AuthorityLevel remains unknown even when operational priority is high.
4. **Assessment is not execution.** Assess/reassess does not activate a CollectionPlan, change a schedule, create execution authority, or dispatch a Worker.
5. **Rescan is a recommendation.** A 7/30/90-day recommendation is displayed for human action only. D2.1 does not write it into CollectionPlan scheduling.
6. **Evidence-based explainability is preserved.** The detail view exposes the evidence snapshot and dimension reasons used by the deterministic evaluator.
7. **Acquisition cost is a proxy.** It is based on observed byte footprint and is not billing or real infrastructure cost data.
8. **No bulk autonomous reassessment.** The operator workbench permits explicit per-Source assessment, not automatic cohort-wide scoring or collection.

## Batch read boundary

`GET /api/source-intelligence?sourceIds=...` supports at most 100 unique Source ids. This is a bounded read convenience for operator cohorts; it does not run assessments.

`POST /api/source-intelligence` remains the explicit assessment action for one Source.

## Calibration gate before D3

Before lateral discovery is allowed to use Source Intelligence as a prioritization signal, D2.1 should be calibrated on a small real cohort:

- USPTO as the Golden Source;
- 10–20 real trademark law-firm/professional websites;
- a mix of high-value and low-value sources where practical.

The review should compare machine operational ranking with human professional judgment and record disagreements. The goal is not to make the evaluator a legal judge; it is to determine whether its operational prioritization is useful enough to guide bounded discovery budgets.
