# @markorbit/persistence

Reference persistence adapters for MarkOrbit Knowledge control-plane registries, execution ledger and Worker lease boundary.

The first adapter uses Node.js built-in `node:sqlite` and persists locked Schema v1 objects, separate Execution Contract v1 records and Worker Protocol v1 records. It is intended for local development and self-hosted single-node deployments. Repository interfaces isolate callers from the adapter so a PostgreSQL implementation can be introduced later without redefining API or UI contracts.

## Exports

- `@markorbit/persistence` — database initialization, migrations and Source Registry;
- `@markorbit/persistence/connectors` — immutable Connector Registry;
- `@markorbit/persistence/collection-plans` — CollectionPlan scheduling-intent registry;
- `@markorbit/persistence/execution-ledger` — manual dispatch, CollectionRun and Job ledger;
- `@markorbit/persistence/workers` — Worker definitions, credentials, heartbeats and Job leases.

## Guarantees

- numbered idempotent migrations;
- global-public Workspace bootstrap;
- `crawl4ai-web@1.0.0` ConnectorManifest bootstrap;
- Schema v1, Execution Contract v1 and Worker Protocol v1 validation before writes and after reads;
- immutable ConnectorManifest versions except lifecycle status;
- exact active compatible Connector binding for new and changed Sources;
- unique Source Slug per Workspace and unique CollectionPlan name per Source;
- optimistic concurrency for SourceDefinition, CollectionPlan, WorkerDefinition and queued-run cancellation;
- archive instead of destructive Source or CollectionPlan deletion;
- transactional creation of one PENDING CollectionRun and one initial PENDING Job;
- immutable plan, source and exact ConnectorManifest dispatch snapshots;
- Workspace-scoped dispatch idempotency;
- cryptographically random one-time Worker credentials and lease tokens;
- digest-only credential and lease-token storage with constant-time verification;
- durable bounded heartbeat evidence and derived Worker status;
- deterministic priority-ordered compatible Job selection;
- one active lease per Job enforced by transaction and partial unique index;
- Job transitions limited to `PENDING ↔ LEASED` in Worker Protocol v1;
- lease renewal, release, expiry, revocation and idempotent reap;
- parent CollectionRun remains PENDING while work is only leased;
- recursive secret-value rejection;
- no Connector code execution, Crawl4AI invocation, RawArtifact creation, scheduler calculation, retry creation or MarkOrbit Core semantics.

## Default database

The admin application resolves the registry path in this order:

1. `MARKORBIT_KNOWLEDGE_DB_PATH`;
2. `.data/markorbit-knowledge.sqlite` below `MARKORBIT_REPOSITORY_ROOT`;
3. `.data/markorbit-knowledge.sqlite` below `INIT_CWD` or the current process directory.

The database, WAL and shared-memory files are ignored by Git.
