# Persistence and Source Registry

## Purpose

KNOWLEDGE-TASK-003 introduces the first durable registry in MarkOrbit Knowledge. The registry stores Schema v1 `SourceDefinition` objects and exposes them through the administration API and Sources UI.

Persistence is an implementation detail beneath the locked contracts:

```text
Sources UI
   ↓
/api/sources
   ↓
SourceRepository
   ↓
SQLite reference adapter
   ↓
Schema v1 SourceDefinition JSON + indexed columns
```

## Reference adapter

The repository uses Node.js built-in `node:sqlite` for the initial local/self-hosted adapter. This avoids a native third-party dependency and gives the project a real restart-safe registry before selecting the distributed production database.

SQLite is not declared to be the final central multi-node database. Callers depend on `SourceRepository`, not on SQLite APIs or table layouts. A future PostgreSQL adapter must preserve the same SourceDefinition and API behavior.

## Database location

The admin application reads `MARKORBIT_KNOWLEDGE_DB_PATH`. When it is unset, the registry uses:

```text
.data/markorbit-knowledge.sqlite
```

The `.data` directory and SQLite sidecar files are excluded from Git.

## Migrations

Migrations are ordered by durable identifiers such as:

```text
0001_source_registry
```

Applied identifiers are recorded in `schema_migrations`. Initialization can run repeatedly; an applied migration is not executed again. Migration SQL creates only persistence structures and must not redefine Schema v1 semantics.

## Storage model

Each SourceDefinition is stored twice within one row:

1. the complete canonical Schema v1 JSON document;
2. selected indexed columns required for filtering and uniqueness.

Indexed columns include Workspace, Slug, type, category, authority level, status, Connector ID, canonical URI, update time and JSON arrays for jurisdictions, languages and tags.

The JSON document remains the authoritative persisted representation. Every write is validated with `isSourceDefinition`, and every read is validated again before being returned.

## Concurrency and history

Updates require the `updatedAt` value originally read by the client. A mismatched value returns `SOURCE_VERSION_CONFLICT` rather than silently overwriting another change.

Archiving sets the SourceDefinition status to `ARCHIVED`. The API does not expose destructive delete.

## Workspace bootstrap

The registry bootstraps the locked `global-public` Workspace fixture. Workspace administration remains outside this task. Slugs are unique within a Workspace, not globally.

## Secrets

`connectorConfig` is recursively checked by the Schema v1 guard. Passwords, tokens, API keys, private keys and similar credential fields are rejected. A source may store only a `secretRef` identifier.

The API never returns the database path or SQLite error details.

## LOCAL_ONLY boundary

A Workspace using `LOCAL_ONLY` synchronization must keep its source records, raw files and staging material on the authorized local node. Customer-local content must not be copied into the central registry merely because the same repository interface is used.

## Backup and recovery

For a stopped single-node instance, back up the SQLite database file together with any `-wal` and `-shm` sidecars that still exist. For a running instance, use a SQLite-consistent backup procedure rather than copying only the main file.

Before restoring:

1. stop the admin process;
2. preserve the current database as a rollback copy;
3. restore the database and matching sidecars or a completed consistent backup;
4. start the application and allow migrations to run;
5. verify the Sources list and a sample SourceDefinition.

## Deferred capabilities

This persistence foundation does not include authentication, authorization, PostgreSQL, ConnectorManifest persistence, CollectionPlan persistence, jobs, workers, RawArtifact storage, Obsidian sync, Ready Packages or MarkOrbit Core logic.
