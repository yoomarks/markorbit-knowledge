# Source Operational Topology V1

Source Operational Topology is a read-only projection over existing authoritative registries. It does not introduce a second source graph, family registry, authority registry, or artifact registry.

The projection joins objective persisted facts from:

`SourceDefinition → SourceRegistryV2 → SourceGraph → RawArtifact`

It exposes explicit source parentage, explicit source relationships and discovery provenance, active retained/observed graph nodes, explicit `PUBLISHED_BY` authority relationships, SourceDefinition entrypoints, and persisted RawArtifact lineage in one operational view.

## Evidence rules

- Source family membership is derived only from explicit `parentSourceId` links. Cycles or cross-workspace parentage fail closed.
- An authority is exposed only when an active non-rejected `ORGANIZATION/AUTHORITY` node is the object of an active non-rejected `PUBLISHED_BY` edge. Source category, hostname, display name, or authority level never infer that relationship.
- Entrypoints come only from `SourceDefinition.entrypoints`; graph matching uses normalized URI equality.
- RawArtifacts are read in full for the requested workspace/source and remain unmatched when neither canonical URI nor provenance source URI equals an entrypoint.
- Missing SourceRegistryV2, SourceGraph, or RawArtifact state remains explicit in `coverage`; absence is not converted into inferred negative knowledge.

This view is intended for operations, diagnostics, supply-health composition, and later Source Intelligence closed-loop work. All mutations continue to occur through the existing authoritative registries.
