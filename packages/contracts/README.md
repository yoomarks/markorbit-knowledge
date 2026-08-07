# @markorbit/contracts

Public TypeScript contracts for MarkOrbit Knowledge acquisition and staging.

## Schema v1

The package mirrors the canonical JSON Schemas under `schemas/v1/` for:

- Workspace;
- ConnectorManifest;
- CollectionPlan;
- SourceDefinition;
- RawArtifact.

It exports:

- stable enum vocabularies;
- TypeScript object types;
- dependency-free runtime guards;
- a recursive detector for forbidden credential fields in source configuration.

JSON Schema remains authoritative at file, API and external connector boundaries. The runtime guards are intended for fixtures and trusted internal handoffs; they are not a replacement for a full Draft 2020-12 validator at untrusted production boundaries.

These contracts are not database persistence models and do not include MarkOrbit Core knowledge, capability, value or recommendation objects.
