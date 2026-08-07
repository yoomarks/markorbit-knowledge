# ADR-0002: Schema v1 and compatibility policy

- **Status:** Accepted
- **Date:** 2026-07-15

## Context

MarkOrbit Knowledge needs durable contracts before database, crawler, worker, object-storage and Obsidian implementations are introduced. Without an implementation-independent schema, each subsystem could define incompatible source, plan and artifact models.

The platform also needs controlled extensibility. Permissive arbitrary fields make migrations and cross-provider behavior unpredictable, while hard-coding provider-specific fields into the core schema prevents connector growth.

## Decision

1. JSON Schema Draft 2020-12 under `schemas/v1/` is the canonical interchange contract.
2. Schema v1 initially covers Workspace, ConnectorManifest, CollectionPlan, SourceDefinition and RawArtifact.
3. TypeScript contracts and dependency-free runtime guards mirror the canonical schemas.
4. Contract roots reject unknown properties.
5. Optional provider metadata is allowed only in an `extensions` object whose keys begin with `x-`.
6. Object IDs use typed ULID prefixes; connector IDs use lower-kebab slugs and connector versions use semantic versioning.
7. `schemaVersion` is independent from API, application and database versions.
8. Source configuration stores only secret references, never credential values.
9. RawArtifact is immutable; content changes create a new artifact and version link.
10. Knowledge sync modes are `RAW`, `METADATA` and `LOCAL_ONLY`. Value-only synchronization remains a MarkOrbit Core concern.

## Compatibility policy

A v1 change is backward compatible only when it adds an optional field or clarifies non-semantic documentation. Adding required fields, removing or renaming fields, changing ID patterns, removing enum members or changing existing meaning requires a new major schema version.

Consumers reject unknown top-level fields and accept documented `x-` extensions. Generic behavior must not depend on extensions.

## Consequences

### Positive

- Database and runtime implementations must conform to a stable boundary.
- Crawl4AI and future connectors remain replaceable.
- Obsidian staging files can retain stable source and artifact references.
- Raw evidence remains auditable and reproducible.
- Provider-specific growth does not pollute generic contracts.

### Costs

- Schema changes require explicit compatibility review.
- TypeScript mirrors and fixtures must stay synchronized with JSON Schema.
- A production-grade Draft 2020-12 validation library will still be needed at untrusted boundaries.
- Strict top-level validation makes informal ad hoc fields invalid by design.

## Rejected alternatives

### Database-first models

Rejected because database layout is an implementation choice and would couple connectors, files and Core integration to an early persistence technology.

### TypeScript-only contracts

Rejected because Python workers, local agents, files and external tools require a language-neutral contract.

### Fully permissive JSON objects

Rejected because they prevent reliable compatibility guarantees and make management UI behavior unpredictable.

### Value-only sync in Knowledge

Rejected because value extraction and value objects belong to MarkOrbit Core, not the acquisition and staging control plane.
