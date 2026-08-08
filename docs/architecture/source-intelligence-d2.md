# Source Intelligence D2

Source Intelligence is the operational prioritization layer for governed source acquisition. It answers **how valuable a source appears for further collection and when an operator should consider rescanning it**. It does not decide legal authority, truth, professional quality, or execution authority.

## Boundary

`SourceDefinition + Source Graph + RawArtifact evidence → deterministic assessment → operator recommendation`

The assessment is deliberately separate from `SourceDefinition.authorityLevel`. Authority is consumed only when it has already been explicitly assigned. The evaluator never infers or upgrades authority from a score, domain name, content, or source category.

Every assessment freezes these boundaries:

- `legalTruthVerified: false`
- `authorityInferred: false`
- `autoScheduleApplied: false`

A Tier A source is therefore **not** automatically an authoritative source. A Tier D source is **not** automatically rejected, archived, deleted, or excluded.

## Dimensions

D2 records explainable dimensions rather than one opaque score:

- **Relevance** — topic coverage and retained graph evidence.
- **Authority signal** — explicit `SourceDefinition.authorityLevel` only; UNKNOWN remains unknown.
- **Freshness** — recency of immutable RawArtifact capture evidence.
- **Evidenceability** — coverage backed by RawArtifact provenance.
- **Novelty** — new graph/artifact evidence relative to the previous assessment when a baseline exists.
- **Acquisition cost** — a byte-footprint heuristic only, not billing or infrastructure truth.

Unknown evidence is represented as `score: null` with LOW confidence. The evaluator does not manufacture precision to fill missing data.

## Operational tiers

- **A** — high operational priority; recommend review/rescan around every 7 days.
- **B** — focused recurring source; recommend around every 30 days.
- **C** — profile/periodic source; recommend around every 90 days.
- **D** — manual review only.

These are recommendations. D2 never mutates `CollectionPlan.schedule`, activates a plan, authorizes a CollectionRun, or crosses any Execution boundary.

## Idempotency and history

The current evidence snapshot receives a deterministic SHA-256 fingerprint. Reassessing unchanged evidence reuses the persisted assessment. A changed evidence snapshot creates a new immutable assessment while preserving prior history for novelty comparison and audit.

## Next step

After D2 is proven on USPTO and a controlled cohort of professional sites, a later operator action may explicitly apply a recommended cadence to a CollectionPlan. That action must remain reviewable and separate from the assessment itself.
