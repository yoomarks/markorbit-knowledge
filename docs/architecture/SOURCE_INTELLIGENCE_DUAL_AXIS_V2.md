# Source Intelligence Dual-Axis Protocol v2

## Status

D2.4 introduces a read-compatible v2 projection for Source Intelligence. It does not rewrite or reinterpret persisted v1 assessments.

The protocol is based on the D2.3 bounded before/after evidence calibration completed on 2026-08-08.

## Why v2 exists

D2.3 collected one governed page from each of three real sources:

| Source           | Before |  After | Delta |
| ---------------- | -----: | -----: | ----: |
| USPTO Trademarks | 32 / D | 64 / B |   +32 |
| Finnegan         | 30 / D | 60 / B |   +30 |
| INTA             | 29 / D | 61 / B |   +32 |

All three sources changed from D to B after a single collection even though their Relevance and explicit Authority Signal did not change. The score movement came from Freshness, Evidenceability and Novelty.

That experiment established that v1 `priorityScore` combines two different operational questions:

1. **Source Value Priority** — how valuable the source is as a target for Knowledge acquisition attention.
2. **Evidence Maturity** — how much current, provenance-backed evidence Knowledge already holds for that source.

These questions must not share one Tier.

## Compatibility strategy

D2.4 uses **projection migration**, not storage migration.

- Persisted `SourceIntelligenceAssessment` v1 objects remain protocol `1.0` and keep their historical `priorityScore`, `operationalTier` and `recommendedRescan` semantics.
- The current Source Intelligence repository remains a v1 repository.
- The default Source Intelligence API remains v1.
- v2 is produced deterministically from the latest persisted v1 assessment only when explicitly requested.
- No historical assessment is rewritten.
- No new scheduler consumes v2 in D2.4.

API consumers opt into v2 with `protocolVersion=2.0` on GET or `protocolVersion: "2.0"` on POST. Omitting the parameter continues to mean v1.

## Axis 1: Source Value Priority

`Source Value Priority` answers:

> Where should Knowledge spend acquisition attention?

D2.4 uses only:

- `RELEVANCE`
- explicit `AUTHORITY_SIGNAL`

It deliberately excludes:

- `FRESHNESS`
- `EVIDENCEABILITY`
- `NOVELTY`
- `ACQUISITION_COST`

The first three describe evidence already held. Acquisition Cost is exposed separately as decision context because cost can influence a later acquisition policy without redefining the underlying value of a source.

Bands are:

- `VERY_HIGH`
- `HIGH`
- `MEDIUM`
- `LOW`

A source with no RawArtifact evidence can therefore still have high Source Value. `UNOBSERVED` is not a low-value classification.

Explicit authority remains explicit. v2 does not infer authority from domain, organization name, source content or graph relationships.

## Axis 2: Evidence Maturity

`Evidence Maturity` answers:

> How mature is the evidence currently held by Knowledge for this source?

It uses:

- `FRESHNESS`
- `EVIDENCEABILITY`
- `NOVELTY`

Stages are:

- `UNOBSERVED` — no RawArtifact evidence is currently held.
- `CAPTURED` — RawArtifact evidence exists, but the source-local evidence chain is not yet sufficiently traceable.
- `TRACEABLE` — artifact-backed source-local provenance is materially present.
- `CURRENT_TRACEABLE` — traceable evidence is also current under the protocol's current freshness heuristic.

These stages describe acquisition evidence state only.

`CURRENT_TRACEABLE` does **not** mean:

- legally correct;
- complete;
- verified legal truth;
- verified identity;
- professionally qualified;
- suitable for MGSN;
- approved for protected execution.

## Acquisition cost

Observed Acquisition Cost remains a heuristic byte-footprint signal in D2.4. It is exposed as `decisionContext.observedAcquisitionCost` and is not part of either axis score.

Future scheduling may consider value, evidence gaps and acquisition cost together, but that policy is not authorized by this protocol.

## v1 compatibility block

Every v2 projection records the exact v1 source assessment from which it was derived:

- legacy assessment ID;
- legacy priority score;
- legacy operational Tier;
- legacy recommended rescan.

This preserves auditability and allows old and new operator surfaces to coexist while D2.5 calibrates the new axes.

## Scheduling boundary

Every v2 object carries:

`policyStatus = NOT_AUTHORIZED_UNCALIBRATED`

D2.4 does not turn either axis into an autonomous scheduling rule. In particular, a high Source Value score does not itself authorize collection, and low Evidence Maturity does not itself authorize a crawl.

Human acceptance, Collection Plan state and explicit collection authorization remain separate protected controls.

## Truth and professional boundaries

A v2 assessment explicitly does not establish:

- legal truth;
- inferred authority;
- professional quality;
- identity verification;
- collection authority;
- automatic scheduling authority;
- MGSN qualification.

Source Graph `OBSERVED`, `RETAINED` and `REJECTED` semantics remain unchanged. No `VERIFIED` state is introduced.

## D2.5 gate

Before any scheduler consumes v2, D2.5 must calibrate both axes on a broader real-source cohort, including official and professional sources.

The next scheduling design should reason about at least:

`Source Value Priority × Evidence Gap × Acquisition Cost`

rather than reusing the v1 Tier as an execution policy.
