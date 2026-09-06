# USPTO Mark Format Reference V1

Issue: `yoomarks/markorbit-knowledge#730`
Downstream consumer dependency: `yoomarks/markorbit#903`

## Purpose

This contract governs the smallest official USPTO evidence set needed for the
US trademark mark-format strategy dimension: standard character versus special
form/design drawing.

Knowledge owns acquisition, provenance, version/currentness evidence and exact
retrieval lineage. It does not choose a filing strategy, make a legal conclusion,
or recommend a drawing format.

## Frozen source scope

V1 contains exactly two `PRIMARY_OFFICIAL` USPTO pages:

1. `DRAWINGS_AND_SPECIMENS`
   - `https://www.uspto.gov/trademarks/basics/drawings-and-specimens`
   - source version / expected `Last updated`: `2023-11-30`
2. `MARK_DRAWINGS`
   - `https://www.uspto.gov/trademarks/basics/mark-drawings-trademarks`
   - source version / expected `Last updated`: `2025-01-18`

The moving TMEP `version=current` alias is not a frozen V1 source. It remains
corroboration-only until a deterministic current-version identity can be proven.

## Bounded facts

The profile permits source evidence for six fact identifiers only:

- `DRAWING_REQUIRED`
- `STANDARD_AND_SPECIAL_ARE_DISTINCT`
- `STANDARD_CHARACTER_TEXT_ONLY`
- `SPECIAL_FORM_STYLIZED_DESIGN_COLOR`
- `DRAWING_TYPE_AFFECTS_PROTECTION`
- `ONE_MARK_VARIATION_PER_APPLICATION`

Each fact must bind to its frozen query and an exact Retrieval chunk identity.
Missing or duplicate fact bindings fail closed.

## Evidence identity

A current source attestation preserves:

- profile id, source key and source version;
- canonical URI and exact source `Last updated` date;
- workspace id and SourceDefinition id;
- Retrieval document id and content SHA-256;
- RawArtifact id and artifact version;
- capture/index timestamps and `isCurrent` state;
- per-fact query, chunk id and chunk SHA-256;
- independent HTTP body SHA-256 and bounded-anchor observation.

## Currentness and disagreement

`CURRENT` requires all of the following:

- exact profile/source/version/URI identity;
- expected `Last updated` date observed in both governed browser-derived content
  and independent HTTPS corroboration;
- all bounded anchors observed by both transports;
- complete RawArtifact and Retrieval lineage;
- valid document/chunk SHA-256 identities;
- all required fact bindings present exactly once;
- the Retrieval document remains current;
- governed capture age does not exceed 31 days.

Failures are explicit: `DRIFT`, `STALE`, or `UNVERIFIED`. Retrieval success or
HTTP 200 alone never promotes evidence to current.

## Governed acquisition

Each page has its own SourceDefinition and exact-page CollectionPlan. Both reuse
`crawl4ai-web@1.2.0`, the existing RawArtifact lifecycle, production Markdown
conversion, Staging and Retrieval index. No second source, storage, conversion,
or delivery runtime is introduced.

`USPTO Mark Format Reference Live Evidence` runs both pages through that chain
and emits the exact downstream handoff only after attestation succeeds.

## Downstream handoff

The live evidence test emits one machine-readable JSON object containing both
source attestations. `markorbit#903` must bind to the exact source ids, source
versions, document SHA-256 values, chunk ids and chunk SHA-256 values from that
accepted run. It must not reconstruct identity from a later moving corpus.

If any frozen source changes, Knowledge publishes a new attested identity; it
does not silently update the evidence that an existing Method references.

## Authority boundary

This evidence must not be used inside Knowledge to produce:

- legal conclusions or registrability conclusions;
- customer recommendations;
- filing-basis or classification strategy;
- filing authorization or execution;
- deadlines or Official Status;
- likelihood-of-confusion conclusions.

Source Evidence != Strategy Interpretation != Recommendation != Authorization != Action.
