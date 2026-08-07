# ADR-0003: SQLite reference persistence adapter

- **Status:** Accepted
- **Date:** 2026-07-16

## Context

Schema v1 is locked, and MarkOrbit Knowledge now needs a real Source Registry that survives process restarts. The project must support Node.js 22 and 24, avoid premature coupling to a distributed database design and keep the control-plane API independent from table layout.

A fixture-only UI can no longer validate SourceDefinition lifecycle, uniqueness, filtering, concurrency or secret exclusion. At the same time, selecting the final production PostgreSQL topology, authentication model and deployment platform would expand this task beyond the Source Registry foundation.

## Decision

1. Introduce a `SourceRepository` abstraction in `@markorbit/persistence`.
2. Implement the first adapter with Node.js built-in `node:sqlite`.
3. Treat SQLite as the local/self-hosted reference adapter, not the final distributed production database.
4. Persist complete Schema v1 SourceDefinition JSON plus indexed columns.
5. Use ordered idempotent migrations recorded in `schema_migrations`.
6. Bootstrap the locked global-public Workspace.
7. Enforce unique Slug per Workspace.
8. Require optimistic concurrency through `updatedAt`.
9. Archive records instead of exposing destructive deletion.
10. Keep database paths and implementation errors outside API responses.

## Consequences

### Positive

- The Sources UI and API operate on real durable data.
- No native third-party database dependency is added.
- Tests can use in-memory SQLite while restart tests use a temporary file.
- Schema v1 remains authoritative over database layout.
- A future PostgreSQL adapter can preserve the repository contract.

### Costs

- SQLite remains a single-node persistence technology.
- Synchronous database calls are acceptable for the current administration control plane but must be reviewed for higher concurrency.
- Node 22 exposes `node:sqlite` as an experimental module even though it no longer requires a command-line flag in supported releases.
- Production backup, high availability and horizontal scaling remain deferred.

## Rejected alternatives

### JSON files as the primary registry

Rejected because filtering, uniqueness, concurrency and transactional migration behavior would need to be rebuilt poorly.

### PostgreSQL immediately

Rejected for this task because deployment, credentials, CI services, connection pooling and production topology are not yet locked.

### Third-party native SQLite package

Rejected because it adds native build and Node-version compatibility risk when the supported Node runtimes already provide the required SQLite API.

### ORM-first models

Rejected because database models must conform to Schema v1 rather than become a second source of truth.
