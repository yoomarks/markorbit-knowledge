# MarkOrbit Knowledge v0.1 Release Readiness

Date: 2026-08-12  
Reviewed baseline: `2d3a66b4dbb3ac20e1d494f110d7c6bcd4e9e679`  
Release line: repository package version `0.1.0`

> Historical baseline notice (2026-08-23): this document records the 2026-08-12 freeze decision. It is not the current repository completion report. See [`KNOWLEDGE_POST_FREEZE_PRODUCTION_VALIDATION_CLOSEOUT_2026-08-23.md`](KNOWLEDGE_POST_FREEZE_PRODUCTION_VALIDATION_CLOSEOUT_2026-08-23.md) for post-freeze production-validation and acquisition-intelligence status.

## Decision

**The MarkOrbit Knowledge v0.1 control-plane trunk is freeze-ready after this release-closeout change.**

This is a freeze decision for the current Knowledge repository scope. It is **not** a declaration that every source type and every item in the original PRD v1.0 Draft is implemented, and it is not a MarkOrbit-wide GA declaration.

No P0/P1 defect was found that requires rebuilding K01-K16 or the K-EXT ingestion/operations extensions. The remaining work is either:

1. external integration activation owned by another repository;
2. connector/provider breadth;
3. deployment automation beyond the current local/self-hosted reference model; or
4. product polish that does not change the architectural backbone.

## Freeze scope

The v0.1 trunk now has a governed path across the following layers.

### Acquisition and control plane

- Workspace-scoped SourceDefinition, ConnectorManifest and CollectionPlan registries;
- immutable connector versions and exact compatibility checks;
- CollectionRun / Job execution ledger;
- Worker registration, heartbeat, capacity, leases and controlled lifecycle evidence;
- production Crawl4AI web acquisition with bounded execution and egress policy;
- governed Manual Upload ingestion;
- production Local Folder Worker ingestion with root aliases and containment controls;
- production read-only IMAP Email Worker ingestion;
- immutable RawArtifact SHA-256 identity, provenance and local CAS;
- durable automatic CollectionPlan scheduling and change-watch materialization;
- no automatic retry creation after terminal failure.

### Conversion and staging

- immutable ConverterManifest and Conversion Profile control;
- durable ConversionRun and conversion-worker lease/runtime protocols;
- production normalization/extraction paths for PDF, DOCX, XLSX, CSV, JSON, XML, EMAIL, TEXT and IMAGE inputs;
- separate OCR provenance;
- verified Staging content and controlled finalization.

### Vault and downstream handoff

- Workspace Vault Binding;
- explicit export with durable pre-write evidence and reconciliation;
- read-only inspection;
- reviewed import intent;
- retry-safe import execution into Vault-origin Staging;
- immutable Staging verification/finalization;
- Canonical Downstream Document promotion;
- ReadyPackage V1/V2 and Content Export V1/V2;
- K14 exact V2 request freeze before network;
- K15 append-only delivery audit timeline;
- K16 fail-closed delivery reconciliation and explicit recovery diagnoses.

### Product and operations

- real Admin control-plane surfaces rather than fixture dashboard numbers;
- Workspace-scoped Operations Readiness derived from durable state;
- `READY`, `DEGRADED`, `BLOCKED` and non-health-degrading `ACTION` classifications;
- operator links for Source, Worker, Run, Conversion, Scheduler and ReadyPackage conditions;
- Node 22 and Node 24 validation baseline.

## What is deliberately not required for this freeze

The following are valid future work, but they do not justify reopening the v0.1 trunk architecture.

### Connector breadth

The PRD names additional source/provider families such as API, DATABASE, GITHUB and RSS. They should enter through the existing Source / Connector / Plan / Worker / RawArtifact contracts. Missing breadth is not a reason to redesign those contracts.

### Automatic Vault merge or two-way synchronization

Current Vault mutation remains explicit and evidence-driven. Automatic conflict merge and general two-way synchronization remain out of scope. No future feature may silently weaken K08-K12 provenance or operator authorization boundaries.

### MarkOrbit Core semantic work

Information understanding, entity resolution, distillation, capabilities, value scoring and recommendations remain Core responsibilities and must not move into this repository.

## External activation dependency: Core ReadyPackage V2 receiver

Knowledge can freeze independently of the Core V2 consumer because the V2 outbound gate remains disabled unless a dedicated V2 endpoint/protocol is explicitly configured.

Production activation of V2 delivery still requires the main `yoomarks/markorbit` repository to provide and verify the dedicated ReadyPackage V2 consumer. The previously handed-off work packages remain the correct external sequence:

1. V2 contract/ingress with exact frozen request-byte handling;
2. durable idempotency/submission ledger;
3. immutable Content Export V2 persistence with provenance;
4. result/recovery semantics compatible with K14-K16;
5. cross-repository E2E proof.

Until that is complete, **do not route V2 through the frozen V1 endpoint and do not add V2-to-V1 fallback**.

This dependency blocks V2 production activation, not the internal Knowledge v0.1 freeze.

## Release gates

A v0.1 tag or deployment candidate should satisfy all of the following.

1. `pnpm check` passes.
2. Normal CI passes on supported Node 22 and Node 24.
3. Dedicated Local Folder and Email Worker gates pass when their paths change.
4. Live external-source workflows remain manual gates; transient external authority/network failures must not become ordinary PR failures.
5. The Admin Operations Readiness view can be loaded for the target Workspace and has no unexplained `BLOCKED` issue.
6. A recoverable backup of the SQLite control-plane state and content stores is taken before a production upgrade; follow `docs/operations/KNOWLEDGE_V0_1_BACKUP_RESTORE.md`.
7. Schema/migration changes have been applied by application startup/normal migration paths before operational traffic is resumed.
8. ReadyPackage V2 network delivery remains disabled unless the dedicated Core V2 receiver has its own verified activation evidence.

## Freeze invariants

After this closeout is merged, treat these as frozen v0.1 trunk invariants:

- Schema v1 is locked; incompatible contract work requires an ADR, a new major schema directory and migration planning.
- RawArtifact identity, bytes, provenance and version history remain immutable.
- Central services issue declarative tasks only; arbitrary remote Worker code execution is forbidden.
- Worker and conversion leases remain authority boundaries.
- Credentials stay out of SourceDefinition, ConnectorManifest, artifacts, Vault content, logs and browser responses.
- K14 frozen V2 request bytes are never regenerated during retry.
- K15 audit events remain append-only.
- K16 reconciliation remains fail-closed.
- No automatic delivery retry is introduced behind the operator's back.
- No V2-to-V1 fallback is introduced.
- Knowledge does not absorb Core semantic/business-intelligence responsibilities.

A proposed change that violates one of these invariants is not normal v0.1 maintenance; it requires explicit architecture review.

## Operational support boundary

The current persistence implementation is a local/self-hosted SQLite reference adapter plus local content-addressed stores. That is sufficient for the v0.1 deployment model, but it does not imply zero-downtime clustered database guarantees.

For v0.1, the supported backup contract is a **quiesced/cold snapshot** of:

- the SQLite database and any SQLite sidecar files that still exist after shutdown;
- the RawArtifact content-addressed store;
- the Staging content-addressed store;
- separately managed Obsidian/Vault files where they are part of the operator's recovery objective.

Hot-copy guarantees are intentionally not claimed. See the backup/restore runbook.

## Post-freeze work order

After v0.1 freeze, work should be prioritized in this order:

1. activate and cross-repository-test the Core ReadyPackage V2 consumer;
2. add new connector/provider breadth only when there is a concrete ingestion need;
3. add deployment/backup automation when the deployment topology requires it;
4. do Admin/UI polish last.

Do not continue adding horizontal framework abstractions merely because the repository has reached a stable trunk.
