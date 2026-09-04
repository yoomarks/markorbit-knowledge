# MarkOrbit Knowledge

MarkOrbit Knowledge is the **Acquisition & Knowledge Staging Control Plane** for the MarkOrbit / Mo ecosystem.

It governs how source material enters the system, how acquisition/conversion work is authorized and executed, how immutable evidence is stored and versioned, how reviewed content moves through Obsidian/Vault staging, and how verified Ready Packages are prepared for MarkOrbit Core.

It does **not** implement MarkOrbit Core information understanding, entity resolution, distillation, capabilities, value scoring or recommendations.

```text
Sources
  ↓
MarkOrbit Knowledge
  ↓
Connectors / Workers / Scheduler
  ↓
Raw Artifact CAS
  ↓
Conversion + Staging
  ↓
Obsidian / Vault review boundary
  ↓
Canonical Downstream Document
  ↓
Ready Package
  ↓
MarkOrbit Core
```

## Current status

Repository package version: **0.1.0**.

The v0.1 control-plane trunk became **freeze-ready** on 2026-08-12. That decision remains the architectural baseline, but it is no longer the complete description of the repository.

The current post-freeze phase is **Evidence Supply Workbench**. The acquisition/control-plane backbone remains the architectural boundary, while product emphasis has shifted toward complete and trustworthy browse/search corpus semantics, durable-truth operator work queues, objective evidence change review, evidence inspection, and factual source coverage/freshness visibility.

The 2026-08-23 closeout remains a historical acceptance baseline. Since then, the repository has consolidated production Worker/Scheduler execution onto the durable Worker Protocol / Execution Ledger path, removed obsolete semantic-scoring and in-memory execution scaffolds, completed evidence-backed retrieval regression and four-family federated read acceptance, and removed the Knowledge Browser 100-record correctness ceiling through #696/#702 rather than creating parallel runtimes.

The current cross-repository acceptance suite covers Core Intake, Managed AI + Capability V2, provider-neutral Managed Communication production bootstrap, MarkReg contract invariants and K-CASE-008. Core may advance independently; the dependency-aware freshness classifier fails closed on relevant or unknown drift and can test current Core without baseline churn when later drift is confined to an already-proven isolated surface.

The immediate internal P1 queue is #704 Hybrid Search completeness, #705 unified Knowledge Query Read Model V2, #706 Operator Inbox, and #707 Evidence Change Review. The genuine external/operator gates remain repository governance #429, explicitly authorized ADK-06 paid/live acceptance #405, and CNIPA backend-only source-identity/schema/pagination/coverage evidence debt #691. Closed CNIPA MVP #573 is no longer an active gate, and Knowledge must not manufacture code work around unavailable authenticated evidence or paid-provider authorization.

See [Knowledge v0.1 Release Readiness](docs/release/KNOWLEDGE_V0_1_RELEASE_READINESS_2026-08-12.md) for the frozen baseline, [Post-freeze Production Validation Closeout](docs/release/KNOWLEDGE_POST_FREEZE_PRODUCTION_VALIDATION_CLOSEOUT_2026-08-23.md) for the historical post-freeze checkpoint, [Knowledge Current State 2026-08-29](docs/release/KNOWLEDGE_CURRENT_STATE_2026-08-29.md), [Knowledge Current State 2026-09-01](docs/release/KNOWLEDGE_CURRENT_STATE_2026-09-01.md), and [Knowledge Current State 2026-09-02](docs/release/KNOWLEDGE_CURRENT_STATE_2026-09-02.md) for prior checkpoints, and [NEXT_TASKS.md](NEXT_TASKS.md) for the current execution pointer.

## Implemented production backbone

### Acquisition and execution

- Workspace-scoped SourceDefinition, ConnectorManifest and CollectionPlan registries;
- immutable semantic-versioned ConnectorManifest administration and exact compatibility checks;
- CollectionRun / Job execution ledger with immutable source/plan/connector snapshots;
- Worker registration, one-time credentials, heartbeats, capacity, atomic compatible claims and leases;
- controlled execution lifecycle with append-only attempts/events/receipts and structured failure evidence;
- deterministic lease expiry/reconciliation without silent terminal retry;
- production Crawl4AI web acquisition with bounded runtime and production egress-proxy enforcement;
- governed Workspace-scoped Manual Upload with bounded media/size policy, exact SHA-256 identity, idempotent replay and targeted Job claims;
- production Local Folder Worker with Worker-local root aliases, traversal/symlink fail-closed controls, bounded scans and stable snapshot identity;
- production read-only IMAP Email Worker ingestion with secret exclusion and replay/cursor boundaries;
- production governed HTTPS API Worker with runtime-only endpoint/auth bindings, DNS/IP SSRF fail-closed controls, pinned-IP TLS transport, bounded structured responses and safe logical provenance;
- production governed RSS 2.0 / Atom 1.0 Worker with exact feed evidence, deterministic entry envelopes, stable RawArtifact version identity, shared public-network SSRF controls and bounded XML parsing;
- production governed GitHub.com repository Worker with immutable commit/tree evidence, verified Git blob identity, stable per-file RawArtifact versioning, runtime-only optional PAT auth and bounded UTF-8 source ingestion;
- durable automatic CollectionPlan scheduling for interval, cron and change-watch schedules;
- claim-triggered scheduler materialization that reuses the existing execution ledger and `PAGE_UPDATE_CHECK` path instead of creating a second scheduler/diff system.

### Raw artifacts and conversion

- immutable RawArtifact ingestion with SHA-256 verification and local content-addressed storage;
- controlled artifact retrieval and provenance/evidence administration;
- immutable ConverterManifest versions and persisted Conversion Profiles;
- ConversionRun ledger, conversion-worker capability/lease/runtime protocols and controlled transitions;
- production document normalization/extraction for PDF, DOCX, XLSX, CSV, JSON, XML, EMAIL, TEXT and IMAGE inputs;
- bounded OOXML/structured-input hardening, explicit PDF text-layer extraction and separate OCR provenance;
- verified Staging output and controlled finalization.

### Vault and downstream handoff

- persistent Workspace-scoped Vault Binding with server-controlled absolute root and portable relative paths;
- explicit Vault Export with PENDING-before-write evidence, frozen destination identity and crash recovery;
- read-only Vault Inspection classifying `UNCHANGED`, `IMPORT_CANDIDATE`, `CONFLICT` and `MISSING`;
- reviewed Vault Import Intent that freezes operator-approved evidence without reading live bytes;
- explicit retry-safe Vault Import Execution into dedicated `IMPORTED_UNVERIFIED` Staging after live size/SHA-256 revalidation;
- Vault-origin Staging Verification/Finalization against the immutable CAS copy, including spoofed provenance rejection;
- provenance-preserving Canonical Downstream Document promotion;
- ReadyPackage V1/V2 and deterministic Content Export V1/V2;
- K14 durable ReadyPackage V2 freeze-before-network preparation with exact request/idempotency retry semantics;
- K15 append-only ReadyPackage V2 delivery audit timeline;
- K16 fail-closed delivery reconciliation with explicit diagnoses for safe submit, exact-request retry, local finalization, delivered, consumer-rejected and inconsistent evidence.

### Product and operations

- real Admin surfaces for Sources, Plans, Runs, Workers, Raw Artifacts, Conversion, Vault and Ready Packages;
- governed Manual Upload Admin control;
- real execution and delivery evidence timelines;
- Workspace-scoped Operations Readiness derived from durable Source, Worker, Run, Scheduler, Conversion and ReadyPackage V2 evidence;
- `READY`, `DEGRADED`, `BLOCKED` and non-health-degrading `ACTION` classifications with direct operator links;
- Node 22 and Node 24 validation in CI;
- dedicated production gates for Local Folder and Email Worker paths plus manually triggered live external-source smoke workflows.

## Safety invariants

The following are release-line invariants, not optional implementation details:

- Schema v1 is locked; incompatible changes require an ADR, a new major schema directory and migration planning.
- RawArtifact bytes, hashes, provenance and version chains are immutable.
- Central services issue declarative tasks only; arbitrary remote Worker code execution is forbidden.
- Worker and conversion leases remain authorization boundaries.
- Credentials never belong in SourceDefinition, ConnectorManifest, RawArtifact, Vault content, logs or browser responses.
- Terminal execution failure does not create an automatic retry behind the operator's back.
- K14 frozen V2 request bytes are never regenerated during retry.
- K15 delivery audit evidence remains append-only.
- K16 reconciliation remains fail-closed.
- ReadyPackage V2 never falls back to V1.
- Knowledge never absorbs MarkOrbit Core semantic/business-intelligence responsibilities.

## Scheduling model

Automatic scheduling **is implemented** in v0.1.

`INTERVAL`, five-field `CRON`, and `CHANGE_WATCH` plans have durable scheduler state. Before an authenticated Worker claim, the control plane materializes due schedule slots into the normal CollectionRun / Job ledger. Missed intervals are bounded to one catch-up materialization, restart/state lag replays the exact slot idempotently, paused plans do not dispatch, and invalid cron/timezone configuration fails closed without creating a Run.

There is intentionally no separate always-on scheduler daemon in the v0.1 deployment model. See [Collection Scheduler V1](docs/architecture/COLLECTION_SCHEDULER_V1.md).

## Persistence and backup boundary

The current reference deployment is local/self-hosted:

- SQLite control-plane state;
- local RawArtifact content-addressed store;
- local Staging content-addressed store;
- optional server-controlled Obsidian/Vault filesystem root.

Default paths under the repository root are:

```text
.data/markorbit-knowledge.sqlite
.data/artifacts
.data/staging
```

They can be overridden with `MARKORBIT_KNOWLEDGE_DB_PATH`, `MARKORBIT_ARTIFACT_STORE_PATH` and `MARKORBIT_STAGING_STORE_PATH`.

For v0.1 the supported backup contract is a **quiesced/cold coordinated snapshot** of the SQLite state and both CAS roots; Vault files are backed up separately when they are part of the recovery objective. Hot-copy/clustered failover guarantees are not claimed. See [Knowledge v0.1 Backup and Restore](docs/operations/KNOWLEDGE_V0_1_BACKUP_RESTORE.md).

## Deliberate non-goals / deferred breadth

The following are not blockers for the v0.1 trunk freeze:

- additional DATABASE production connector implementation;
- automatic Vault conflict merge or general two-way synchronization;
- a clustered persistence adapter or zero-downtime hot backup topology;
- automatic ReadyPackage delivery retry;
- MarkOrbit Core semantic logic;
- Admin/UI polish that does not change the governed execution/evidence backbone.

New provider breadth should reuse the existing Source → Connector → CollectionPlan → Run/Job → Worker → RawArtifact contracts instead of introducing parallel ingestion systems.

## Start locally

```bash
corepack enable
corepack prepare pnpm@11.13.1 --activate
pnpm install --frozen-lockfile
pnpm dev
```

The default Admin/control plane is `http://localhost:3000`.

Use [.env.example](.env.example) for storage, Worker, Core intake, Vault, Local Folder, API, RSS, GitHub and conversion configuration. Secrets must be injected at runtime and must not be committed.

## Production Crawl4AI Worker

Bootstrap the controlled USPTO reference source, plan and Worker registration:

```bash
pnpm --filter @markorbit/worker bootstrap:uspto
```

Add `-- --dispatch` to create the first authorized PENDING run. The bootstrap prints a newly created Worker credential once; store it in a secret manager.

For local development only, direct egress can be enabled explicitly:

```bash
MARKORBIT_CRAWL4AI_REQUIRE_EGRESS_PROXY=0 pnpm --filter @markorbit/worker start
```

Production Crawl4AI execution requires an egress proxy and refuses to disable that boundary. See [Crawl4AI Worker deployment and USPTO Golden Source](docs/operations/CRAWL4AI_WORKER_DEPLOYMENT.md).

## Validate

```bash
pnpm check
```

Normal pull-request validation covers formatting, lint, typecheck, tests and build across supported Node versions. Dedicated workflows cover production Local Folder and Email Worker paths; live external authority workflows are intentionally manual so transient network/source conditions do not become ordinary PR failures.

## Key documentation

### Product and release

- [Product requirements v1.0 Draft](docs/product/MarkOrbit_Knowledge_PRD_v1.0.md)
- [Knowledge v0.1 Release Readiness](docs/release/KNOWLEDGE_V0_1_RELEASE_READINESS_2026-08-12.md)
- [Post-freeze Production Validation Closeout](docs/release/KNOWLEDGE_POST_FREEZE_PRODUCTION_VALIDATION_CLOSEOUT_2026-08-23.md)
- [Knowledge Current State 2026-08-29](docs/release/KNOWLEDGE_CURRENT_STATE_2026-08-29.md)
- [Knowledge Current State 2026-09-01](docs/release/KNOWLEDGE_CURRENT_STATE_2026-09-01.md)
- [Knowledge Current State 2026-09-02](docs/release/KNOWLEDGE_CURRENT_STATE_2026-09-02.md)
- [Production Validation Wave 1](docs/ops/production-validation-wave-1.md)
- [K-EXT-E Operations Readiness Runbook](docs/operations/K_EXT_E_OPERATIONS_READINESS_RUNBOOK.md)
- [Knowledge v0.1 Backup and Restore](docs/operations/KNOWLEDGE_V0_1_BACKUP_RESTORE.md)

### Architecture and contracts

- [System boundaries](docs/architecture/SYSTEM_BOUNDARIES.md)
- [System architecture v1](docs/architecture/SYSTEM_ARCHITECTURE_V1.md)
- [Acquisition Intelligence Learning Loop](docs/architecture/ACQUISITION_INTELLIGENCE_LEARNING_LOOP.md)
- [Schema v1 guide](docs/architecture/SCHEMA_V1.md)
- [Execution Contract v1](docs/architecture/EXECUTION_CONTRACT_V1.md)
- [Worker Protocol v1](docs/architecture/WORKER_PROTOCOL_V1.md)
- [Execution Lifecycle Protocol v1](docs/architecture/EXECUTION_LIFECYCLE_PROTOCOL_V1.md)
- [Controlled Worker execution](docs/architecture/WORKER_EXECUTION_PROTOCOL_V1.md)
- [Artifact Ingestion Protocol v1](docs/architecture/ARTIFACT_INGESTION_PROTOCOL_V1.md)
- [Manual Upload Ingestion V1](docs/architecture/MANUAL_UPLOAD_INGESTION_V1.md)
- [Local Folder Worker Ingestion V1](docs/architecture/LOCAL_FOLDER_WORKER_INGESTION_V1.md)
- [Collection Scheduler V1](docs/architecture/COLLECTION_SCHEDULER_V1.md)
- [Document Extraction Production Hardening V1](docs/architecture/DOCUMENT_EXTRACTION_PRODUCTION_HARDENING_V1.md)
- [Conversion Control v1](docs/architecture/CONVERSION_CONTROL_V1.md)
- [Conversion Execution Protocol v1](docs/architecture/CONVERSION_EXECUTION_PROTOCOL_V1.md)
- [Conversion Runtime Protocol v1](docs/architecture/CONVERSION_RUNTIME_PROTOCOL_V1.md)
- [Obsidian Vault Binding V1](docs/architecture/OBSIDIAN_VAULT_BINDING_V1.md)
- [Obsidian Vault Export V1](docs/architecture/OBSIDIAN_VAULT_EXPORT_V1.md)
- [Obsidian Vault Inspection V1](docs/architecture/OBSIDIAN_VAULT_INSPECTION_V1.md)
- [Obsidian Vault Import Intent V1](docs/architecture/OBSIDIAN_VAULT_IMPORT_INTENT_V1.md)
- [Obsidian Vault Import Execution V1](docs/architecture/OBSIDIAN_VAULT_IMPORT_EXECUTION_V1.md)
- [Obsidian Vault-origin Staging Verification V1](docs/architecture/OBSIDIAN_VAULT_ORIGIN_STAGING_VERIFICATION_V1.md)
- [Canonical Downstream Document V1](docs/architecture/CANONICAL_DOWNSTREAM_DOCUMENT_V1.md)
- [ReadyPackage V2 and Content Export V2](docs/architecture/READY_PACKAGE_V2.md)
- [ReadyPackage V2 Delivery Protocol V1](docs/architecture/READY_PACKAGE_V2_DELIVERY_V1.md)
- [ReadyPackage V2 Delivery Audit Timeline V1](docs/architecture/READY_PACKAGE_V2_DELIVERY_AUDIT_V1.md)
- [ReadyPackage V2 Delivery Reconciliation V1](docs/architecture/READY_PACKAGE_V2_DELIVERY_RECONCILIATION_V1.md)

### Operations

- [Crawl4AI Worker deployment and USPTO Golden Source](docs/operations/CRAWL4AI_WORKER_DEPLOYMENT.md)
- [API Connector V1](docs/operations/API_CONNECTOR_V1.md)
- [RSS Connector V1](docs/operations/RSS_CONNECTOR_V1.md)
- [GitHub Connector V1](docs/operations/GITHUB_CONNECTOR_V1.md)
- [USPTO Staging / Ready Package Runbook](docs/operations/USPTO_STAGING_READY_PACKAGE_RUNBOOK.md)

### Engineering decisions

- [Runtime baseline decision](docs/decisions/ADR-0001-repository-and-runtime-baseline.md)
- [Schema v1 decision](docs/decisions/ADR-0002-schema-v1-and-compatibility.md)
- [SQLite reference adapter decision](docs/decisions/ADR-0003-sqlite-reference-persistence.md)
- [Immutable ConnectorManifest decision](docs/decisions/ADR-0004-immutable-connector-manifests.md)
- [Plan versus execution decision](docs/decisions/ADR-0005-separate-plan-intent-from-execution.md)
- [Control-plane dispatch decision](docs/decisions/ADR-0006-control-plane-dispatch-and-immutable-snapshots.md)
- [Lease versus Connector execution decision](docs/decisions/ADR-0007-separate-leases-from-connector-execution.md)
- [Execution lifecycle decision](docs/decisions/ADR-0008-lock-execution-lifecycle-before-runtime.md)
- [Fixture runtime decision](docs/decisions/ADR-0009-fixture-runtime-before-real-connectors.md)
- [Conversion execution decision](docs/decisions/ADR-0010-lock-conversion-execution-before-runtime.md)
- [Conversion runtime authorization/leases decision](docs/decisions/ADR-0011-conversion-runtime-authorization-and-leases.md)

See [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) for repository engineering rules.
