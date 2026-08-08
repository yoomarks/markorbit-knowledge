# Source Intelligence D2.6 — Dual-Axis Operator Presentation

## Status

D2.6 changes the default **operator presentation** of Source Intelligence from the legacy v1 Operational Tier to the v2 dual-axis projection:

- **Source Value Priority** — intrinsic operational value of the source.
- **Evidence Maturity** — maturity and traceability of the evidence currently held for the source.
- **Observed Acquisition Cost** — separate decision context, not part of either axis.

This is a read/presentation migration only. It is not a storage migration and it does not authorize scheduling or collection.

## Default operator behavior

The Source Intelligence workbench and source-detail panel explicitly request `protocolVersion=2.0` from the existing API.

The API itself continues to default to protocol `1.0` when no protocol is requested. This preserves backwards compatibility for existing callers.

Operator ordering is:

1. Source Value score descending.
2. Evidence Maturity stage descending only as a tie-breaker among equal Source Value scores.
3. Evidence Maturity score descending within the same stage.
4. Source name for deterministic final ordering.

This ordering deliberately prevents mature evidence from making a lower-value source outrank a higher-value source.

## Default workbench fields

The default table exposes:

- Source
- Source Value
- Evidence Maturity
- explicit Authority Level
- Observed Acquisition Cost
- assessment timestamp
- operator assessment action

Source Value and Evidence Maturity have independent filters.

Legacy v1 Operational Tier, legacy priority score and legacy rescan recommendation are available only under an **Advanced · legacy v1** disclosure.

## Source detail

The source-detail panel presents two primary cards:

- Source Value
- Evidence Maturity

It then exposes:

- Source Value signals: category-based relevance baseline and explicit Authority signal
- Evidence Maturity signals: Freshness, Evidenceability and Novelty
- Acquisition Cost as a separate Decision Context
- legacy v1 compatibility under a collapsed Advanced section

## Invariants

D2.6 must preserve all of the following:

- v1 assessment storage remains the persisted historical record.
- v2 remains a read-compatible projection of v1.
- API callers that do not request protocol `2.0` continue to receive v1.
- `UNOBSERVED` does not mean low Source Value.
- Authority Level is explicit only and is never inferred from Source Value, hostname, domain or organization.
- Evidence Maturity does not verify legal truth or professional quality.
- Acquisition Cost does not enter Source Value or Evidence Maturity.
- no CollectionPlan is created, enabled or mutated by the presentation layer.
- scheduler policy remains `NOT_AUTHORIZED_UNCALIBRATED`.
- no automatic collection authority is granted.
- no MGSN qualification is granted.
- no cross-source identity resolution is introduced.

## D2.6 scope boundary

D2.6 does **not** tune collection cadence, scheduler policy, source acquisition strategy or autonomous execution. Those remain later decisions after the dual-axis operator model has been observed in normal use.
