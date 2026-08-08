# MarkOrbit Knowledge Source Graph Protocol v1

This directory contains the language-neutral JSON Schema for the independently versioned Source Graph Protocol v1.

It is **not** an extension of locked `schemas/v1` and does not redefine Schema v1 `SourceDefinition`, `CollectionPlan` or `RawArtifact`.

The protocol covers:

- `WebsiteSourceProfile`;
- `SourceGraphNode`;
- `SourceGraphEdge`;
- `SourceGraphObservationBatch`.

The JSON Schema defines portable structural validation. Cross-record invariants such as source/profile scoping, duplicate identities, timestamp ordering and identity-strategy rules are additionally enforced by the TypeScript runtime guards in `packages/contracts/src/source-graph-v1.ts` and must be preserved by future persistence implementations.

Graph observations are evidence records. `RETAINED` is not a professional/legal verification state, and the protocol intentionally contains no `VERIFIED` state.
