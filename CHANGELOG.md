# Changelog

All notable changes to MarkOrbit Knowledge are documented here.

## [0.1.0] - 2026-08-12

### Added

- governed SourceDefinition, ConnectorManifest and CollectionPlan control plane;
- durable CollectionRun / Job execution ledger with Worker registration, heartbeat, claims and leases;
- immutable RawArtifact SHA-256 identity, provenance and local content-addressed storage;
- production Crawl4AI web acquisition with bounded runtime and egress controls;
- governed Manual Upload, Local Folder Worker and read-only IMAP Email Worker ingestion;
- durable interval, CRON and change-watch scheduling over the existing Run / Job execution path;
- immutable ConverterManifest / ConversionProfile control and durable ConversionRun lifecycle;
- bounded PDF, DOCX, XLSX, CSV, JSON, XML, EMAIL, TEXT and IMAGE normalization/extraction, with separate OCR provenance;
- persistent Obsidian/Vault Binding, explicit export, read-only inspection, reviewed import intent, retry-safe import execution, verification/finalization and canonical downstream promotion;
- ReadyPackage V1/V2 and deterministic Content Export V1/V2;
- ReadyPackage V2 freeze-before-network preparation, append-only delivery audit timeline and fail-closed reconciliation;
- Workspace-scoped Operations Readiness with READY, DEGRADED, BLOCKED and ACTION classifications;
- Node 22 and Node 24 repository validation plus dedicated production Worker gates;
- quiesced/cold SQLite + RawArtifact CAS + Staging CAS backup/restore operating contract.

### Security and reliability boundaries

- Worker and conversion leases remain authorization boundaries;
- credentials are excluded from SourceDefinition, ConnectorManifest, artifacts, Vault content, logs and browser responses;
- RawArtifact bytes, hashes, provenance and version history remain immutable;
- terminal execution failures do not create hidden automatic retries;
- K14 ReadyPackage V2 exact request bytes are frozen before network and never regenerated for retry;
- K15 delivery audit events are append-only;
- K16 delivery reconciliation fails closed on inconsistent evidence;
- ReadyPackage V2 never falls back to the frozen V1 Core endpoint;
- Knowledge does not absorb MarkOrbit Core semantic, value-scoring or recommendation responsibilities.

### Deferred after v0.1.0

- API, DATABASE, GITHUB and RSS connector breadth;
- clustered persistence and zero-downtime hot backup topology;
- automatic Vault conflict merge or general two-way synchronization;
- automatic ReadyPackage delivery retry;
- Admin/UI polish that does not change the governed execution/evidence backbone.

### External activation dependency

ReadyPackage V2 production delivery remains explicitly gated until a dedicated compatible MarkOrbit Core V2 receiver has been independently implemented and verified. This does not block the Knowledge v0.1.0 repository release itself.
