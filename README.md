# MarkOrbit Knowledge

MarkOrbit Knowledge is the visual acquisition and knowledge-staging control plane for the MarkOrbit / Mo ecosystem.

It manages data sources, collection intent, execution providers, raw artifacts, versions, conversion, Obsidian Vault synchronization and Ready Package delivery. It does **not** implement MarkOrbit Core information understanding, distillation, capabilities, value scoring or recommendations.

## System boundary

```text
Sources
  ↓
MarkOrbit Knowledge
  ↓
Mo Crawl / Connectors / Workers
  ↓
Raw Artifact Store
  ↓
Markdown + YAML
  ↓
Obsidian Knowledge Staging
  ↓
Ready Package
  ↓
MarkOrbit Core
```

## Repository status

The repository now contains:

- pnpm workspace monorepo;
- responsive Next.js administration shell;
- locked Schema v1 JSON contracts and TypeScript guards;
- separate Execution Contract v1 for CollectionRun and Job ledger objects;
- separate Worker Protocol v1 for Worker, heartbeat and JobLease objects;
- separate Execution Lifecycle Protocol v1 for authenticated progress and terminal reports;
- SQLite-backed local/self-hosted Source, Connector, CollectionPlan, Execution and Worker Registries;
- real SourceDefinition list, filters, create, edit, detail and archive UI;
- immutable semantic-versioned ConnectorManifest administration;
- exact SourceDefinition-to-Connector compatibility validation;
- real CollectionPlan list, create, edit, lifecycle and source-default management;
- plan compatibility checks for source, connector capabilities and output artifact kinds;
- manual dispatch that transactionally creates one PENDING CollectionRun and Job;
- Workspace-scoped idempotency and immutable plan/source/connector snapshots;
- real execution-run list, detail and queued cancellation UI;
- real Worker administration, one-time credentials, authenticated heartbeats and leases;
- atomic compatible Job claims and deterministic lease recovery;
- authenticated and lease-token-bound controlled execution transitions;
- append-only execution attempts, events, receipts and structured failure evidence;
- deterministic fixture Connector runtime with no external I/O;
- production Crawl4AI 0.9.2 HTML/Markdown acquisition behind the governed Worker lease and RawArtifact evidence boundary;
- deployable external Crawl4AI Worker process with lease renewal, heartbeat keepalive, bounded runtime and production egress-proxy enforcement;
- USPTO trademark Golden Source bootstrap for a first controlled official-source collection path;
- explicit reconciliation that fails started work when its lease expires;
- immutable RawArtifact ingestion, SHA-256 verification and local content-addressed storage;
- real RawArtifact provenance, ingestion evidence and controlled-download administration;
- immutable semantic-versioned ConverterManifest administration;
- persisted Conversion Profiles with exact-version and input/output compatibility enforcement;
- locked Conversion Execution Protocol v1 for ConversionRuns, events and Staging output evidence;
- locked Conversion Runtime Protocol v1 for Worker conversion capability, claims, exclusive leases, attempts, token-bound reports and input/output grants;
- durable ConversionRun ledger with controlled eligible Artifact / compatible Profile Manual Dispatch, immutable snapshots, idempotency and pending-only cancellation;
- controlled READY-Staging Markdown projection primitive for local Obsidian Vault files with traversal and symlink protections;
- persistent Workspace-scoped Vault Binding V1 with portable relative-root policy, optimistic revisions and explicit ACTIVE/DISABLED state;
- durable explicit Vault Export V1 with PENDING-before-write evidence, frozen destination identity, post-write reconciliation, projection receipts and no silent overwrite of different content;
- explicit read-only Vault Inspection V1 that classifies Markdown as UNCHANGED, IMPORT_CANDIDATE, CONFLICT or MISSING with bounded hash/frontmatter/Wiki Link evidence and no filesystem mutation;
- reviewed Vault Import Intent V1 that freezes operator-approved IMPORT_CANDIDATE evidence as immutable PENDING_EXECUTION authorization without reading Vault bytes or mutating Staging;
- retry-safe explicit Vault Import Execution V1 that persists PENDING before the reviewed live-file read, revalidates frozen size/SHA-256, records dedicated Vault-origin Staging provenance as IMPORTED_UNVERIFIED and recovers across Staging/receipt/finalization crash windows;
- Vault admin controls for binding, filesystem-root readiness, explicit export, read-only inspection, reviewed import intent and explicit import execution without exposing the deployment absolute path;
- real execution evidence timeline in the Runs administration UI;
- versioned migrations, optimistic concurrency and secret exclusion;
- fixture-only previews for modules that have not reached production runtime implementation;
- architecture boundaries, compatibility policy and Node 22/24 CI.

Production web acquisition now exists for bounded HTML/Markdown collection. An operator can explicitly export one verified READY Staging document through its ACTIVE Workspace Vault binding with durable crash-recovery evidence, inspect bound Vault Markdown without mutation, record a reviewed import intent for an observed untracked candidate, and explicitly execute that exact reviewed candidate into dedicated `IMPORTED_UNVERIFIED` Vault-origin Staging after live size/SHA-256 revalidation. Arbitrary PDF/attachment acquisition, converter execution, automatic scheduling, Vault-origin verification/promotion into existing READY/ReadyPackage workflows, automatic conflict merge and two-way synchronization, and MarkOrbit Core semantic logic are not implemented yet. No automatic Vault synchronization is authorized.

Lifecycle meanings are deliberately distinct:

```text
PENDING    = durable work recorded
LEASED     = compatible Worker reserved work
RUNNING    = Worker reported execution start
UPLOADING  = output summary is ready for the ingestion boundary
VERIFYING  = output metadata is ready for control-plane verification
COMPLETED  = verified terminal success
FAILED     = terminal structured failure; no retry is created automatically
```

## Contracts

Canonical acquisition and staging schemas are published under [`schemas/v1`](schemas/v1/). TypeScript consumers use `@markorbit/contracts`.

Schema v1 covers:

- Workspace;
- ConnectorManifest;
- CollectionPlan;
- SourceDefinition;
- RawArtifact.

Execution Contract v1 separately covers:

- CollectionRun;
- Job;
- execution trigger, actor and lifecycle vocabularies.

Worker Protocol v1 separately covers:

- WorkerDefinition;
- WorkerHeartbeat;
- JobLease;
- desired-state, health and lease vocabularies.

Execution Lifecycle Protocol v1 separately covers:

- execution start and progress reports;
- upload-ready and verification-ready reports;
- terminal completion and failure reports;
- append-only JobExecutionEvent shape;
- legal Job transition and single-Job CollectionRun derivation rules.

Controlled Worker execution persistence separately covers:

- durable execution attempts;
- ordered lifecycle events;
- idempotent transition requests;
- metadata-only completion receipts;
- structured failure and lease-loss reconciliation evidence.

Artifact Ingestion Protocol v1 separately covers:

- authenticated streaming ingestion sessions;
- digest and byte-size verification;
- immutable local content-addressed objects;
- complete RawArtifact provenance and controlled retrieval.

Conversion Control Protocol v1 separately covers:

- immutable Converter Manifest versions;
- persisted Conversion Profiles;
- exact Converter/input/output compatibility;
- conversion capability and intent without runtime execution.

Conversion Execution Protocol v1 separately covers:

- future ConversionRun identity and immutable snapshots;
- append-only ConversionExecutionEvent lifecycle evidence;
- verified StagingDocumentDescriptor metadata;
- strict terminal evidence and content-addressed output boundaries.

## Start

```bash
corepack enable
corepack prepare pnpm@11.13.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

The local registries are created at `.data/markorbit-knowledge.sqlite`. Set `MARKORBIT_KNOWLEDGE_DB_PATH` to use another absolute path.

## Production Crawl4AI Worker

Bootstrap the first controlled USPTO trademark source, plan and Worker registration:

```bash
pnpm --filter @markorbit/worker bootstrap:uspto
```

Add `-- --dispatch` to create the first authorized PENDING run. The command returns a newly created Worker credential once; store it as `MARKORBIT_WORKER_CREDENTIAL` in a secret manager.

For local development only, direct egress can be enabled explicitly:

```bash
MARKORBIT_CRAWL4AI_REQUIRE_EGRESS_PROXY=0 pnpm --filter @markorbit/worker start
```

Production Worker execution requires `MARKORBIT_CRAWL4AI_EGRESS_PROXY` and refuses to disable that boundary. See [Crawl4AI Worker deployment and USPTO Golden Source](docs/operations/CRAWL4AI_WORKER_DEPLOYMENT.md).

## Validate

```bash
pnpm check
```

## Documentation

- [Product requirements](docs/product/MarkOrbit_Knowledge_PRD_v1.0.md)
- [System boundaries](docs/architecture/SYSTEM_BOUNDARIES.md)
- [System architecture v1](docs/architecture/SYSTEM_ARCHITECTURE_V1.md)
- [Schema v1 guide](docs/architecture/SCHEMA_V1.md)
- [Execution Contract v1](docs/architecture/EXECUTION_CONTRACT_V1.md)
- [Worker Protocol v1](docs/architecture/WORKER_PROTOCOL_V1.md)
- [Execution Lifecycle Protocol v1](docs/architecture/EXECUTION_LIFECYCLE_PROTOCOL_V1.md)
- [Controlled Worker execution](docs/architecture/WORKER_EXECUTION_PROTOCOL_V1.md)
- [Artifact Ingestion Protocol v1](docs/architecture/ARTIFACT_INGESTION_PROTOCOL_V1.md)
- [Conversion Control v1](docs/architecture/CONVERSION_CONTROL_V1.md)
- [Conversion Execution & Staging Output Protocol v1](docs/architecture/CONVERSION_EXECUTION_PROTOCOL_V1.md)
- [Conversion Runtime Protocol v1](docs/architecture/CONVERSION_RUNTIME_PROTOCOL_V1.md)
- [ConversionRun Ledger](docs/architecture/CONVERSION_RUN_LEDGER.md)
- [Obsidian Vault Binding V1](docs/architecture/OBSIDIAN_VAULT_BINDING_V1.md)
- [Obsidian Vault Export V1](docs/architecture/OBSIDIAN_VAULT_EXPORT_V1.md)
- [Obsidian Vault Inspection V1](docs/architecture/OBSIDIAN_VAULT_INSPECTION_V1.md)
- [Obsidian Vault Import Intent V1](docs/architecture/OBSIDIAN_VAULT_IMPORT_INTENT_V1.md)
- [Obsidian Vault Import Execution V1](docs/architecture/OBSIDIAN_VAULT_IMPORT_EXECUTION_V1.md)
- [Persistence and Source Registry](docs/architecture/PERSISTENCE_AND_SOURCE_REGISTRY.md)
- [Connector Registry](docs/architecture/CONNECTOR_REGISTRY.md)
- [CollectionPlan Registry](docs/architecture/COLLECTION_PLAN_REGISTRY.md)
- [Execution Ledger](docs/architecture/EXECUTION_LEDGER.md)
- [Worker Registry and leases](docs/architecture/WORKER_REGISTRY_AND_LEASES.md)
- [Crawl4AI Worker deployment and USPTO Golden Source](docs/operations/CRAWL4AI_WORKER_DEPLOYMENT.md)
- [Canonical schemas](schemas/v1/README.md)
- [Runtime baseline decision](docs/decisions/ADR-0001-repository-and-runtime-baseline.md)
- [Schema v1 decision](docs/decisions/ADR-0002-schema-v1-and-compatibility.md)
- [SQLite reference adapter decision](docs/decisions/ADR-0003-sqlite-reference-persistence.md)
- [Immutable ConnectorManifest decision](docs/decisions/ADR-0004-immutable-connector-manifests.md)
- [Plan versus execution decision](docs/decisions/ADR-0005-separate-plan-intent-from-execution.md)
- [Control-plane dispatch decision](docs/decisions/ADR-0006-control-plane-dispatch-and-immutable-snapshots.md)
- [Lease versus Connector execution decision](docs/decisions/ADR-0007-separate-leases-from-connector-execution.md)
- [Execution lifecycle contract decision](docs/decisions/ADR-0008-lock-execution-lifecycle-before-runtime.md)
- [Fixture runtime decision](docs/decisions/ADR-0009-fixture-runtime-before-real-connectors.md)
- [Conversion execution contract decision](docs/decisions/ADR-0010-lock-conversion-execution-before-runtime.md)
- [Conversion runtime authorization and leases decision](docs/decisions/ADR-0011-conversion-runtime-authorization-and-leases.md)
- [Contributing](CONTRIBUTING.md)
