# Source Intelligence D2.5 — Dual-axis Real-source Calibration

## Status

D2.5 calibrates the Source Intelligence v2 projection introduced in D2.4 against a wider real-source cohort and a bounded before/after acquisition cohort.

It does **not** authorize autonomous scheduling and does **not** replace persisted v1 assessments.

## Questions D2.5 must answer

1. Can an explicitly identified primary official source remain `VERY_HIGH` Source Value while it is still `UNOBSERVED`?
2. Does Source Value preserve a useful ordering across official, industry, professional and media sources when compared with explicit human calibration priority?
3. Does Evidence Maturity move forward when real RawArtifact evidence is acquired and linked into the Source Graph?
4. Does Source Value remain stable when only evidence-holding signals change?
5. Can Acquisition Cost be observed without being folded back into either v2 axis?
6. Do all v2 scheduling, legal-truth, authority, identity and MGSN boundaries remain closed during calibration?

## Cohorts

The D2.5 manifest contains the same broad real-source families used by earlier calibration work:

- primary official authorities: USPTO, WIPO, EUIPO, UKIPO;
- industry/research: INTA;
- professional sources: Finnegan, Fish & Richardson, Marks & Clerk, Boult, Murgitroyd, Rouse;
- specialist media: World Trademark Review.

Human priority and Authority Level in the manifest are **explicit calibration inputs**. They are not inferred from domain names, page text or organization identity.

### EUIPO calibration entrypoint

The canonical source remains the EUIPO Trade Marks website. D2.5 uses a known public trade-mark subpage as the calibration discovery entrypoint because earlier calibration showed that the top-level Trade Marks entrypoint could fail to yield a governed candidate in the bounded Discovery run.

This is deliberately a calibration-harness accommodation, not a relaxation of the production host boundary. `sameHostOnly`, robots handling and the existing Website Source semantics remain unchanged.

## Mode 1 — Source Value calibration

The wider cohort runs through:

`Discovery → Human ACCEPT → Website Source + PAUSED CollectionPlan → explicit source metadata → v2 assessment`

No Collection Authorization is issued.

Required evidence:

- accepted sources still have a `PAUSED` CollectionPlan;
- Evidence Maturity is `UNOBSERVED` in the isolated registry;
- explicit `PRIMARY_OFFICIAL` anchors are `VERY_HIGH` Source Value even while `UNOBSERVED`;
- human priority versus Source Value is reported with Spearman rank correlation;
- Source Value band distributions and cohort averages are reported;
- v2 is paired to the exact persisted v1 assessment through `compatibility.legacyAssessmentId`.

The rank correlation is calibration evidence, not a policy threshold. D2.5 does not tune weights merely to improve the correlation.

## Mode 2 — Evidence Maturity progression

A smaller representative cohort runs a real but bounded acquisition:

`Discovery → Human ACCEPT → PAUSED plan → v2 baseline → explicit Collection Authorization → Crawl4AI → HTML + Markdown RawArtifact → Source Graph extraction → v2 reassessment`

Collection remains constrained to:

- `maxDepth = 0`;
- `maxItems = 1` per source;
- robots respected;
- low rate limit;
- `crawl4ai-web@1.1.0`;
- isolated calibration registry and artifact store.

The harness requires Evidence Maturity to advance from `UNOBSERVED`. If Relevance and explicit Authority signals are unchanged, Source Value score and band must also remain unchanged.

A real acquisition may legitimately change Relevance if newly extracted evidence changes the observed topical graph. Such a change is reported as an observed Source Value signal change rather than mislabeled as Evidence Maturity leakage.

## Acquisition Cost

D2.5 reports `decisionContext.observedAcquisitionCost` before and after acquisition. It remains outside:

- `sourceValuePriority`;
- `evidenceMaturity`.

The current cost signal remains a byte-footprint heuristic, not billing or economic truth.

## Acceptance boundary

D2.5 may establish that the dual-axis projection is calibrated enough for operator-facing presentation work in D2.6.

It does **not** establish a Scheduler Policy. The required status remains:

`NOT_AUTHORIZED_UNCALIBRATED`

until a later phase explicitly defines and calibrates `Source Value × Evidence Gap × Acquisition Cost` policy.

## Explicit non-goals

D2.5 does not:

- infer Authority from `.gov`, organization names or page content;
- verify legal truth;
- verify professional quality or professional identity;
- resolve Person or Organization identity across websites;
- qualify MGSN providers;
- automatically edit production CollectionPlans;
- create recurring collection schedules;
- migrate persisted v1 assessments;
- make v2 the default API or operator UI representation.

## Automated proof

`.github/workflows/source-intelligence-d2-5-calibration.yml` runs two isolated jobs:

1. wider Source Value calibration;
2. bounded Evidence Maturity progression.

The repository-level `Validate` workflow continues to test Node 22 and Node 24, while the D2.5 live calibration workflow uses Node 24 and the production Crawl4AI runtime for the bounded evidence job.
