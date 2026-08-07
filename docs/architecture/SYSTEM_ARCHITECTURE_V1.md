# MarkOrbit Knowledge System Architecture v1

## 1. Purpose

MarkOrbit Knowledge is the visual acquisition and knowledge-staging control plane for the MarkOrbit ecosystem. It manages acquisition intent, execution-provider selection, raw evidence registration, versioning, conversion coordination, Obsidian staging and Ready Package delivery.

It does not interpret legal meaning or create MarkOrbit Core knowledge, capability, value or recommendation objects.

## 2. System flow

```text
SourceDefinition + CollectionPlan
              ↓
MarkOrbit Knowledge control plane
              ↓ declarative request
Mo Crawl / Connector / Local Worker
              ↓
RawArtifact registration and immutable storage reference
              ↓
Converter → Markdown + YAML StagingDocument
              ↓
Obsidian Knowledge Staging
              ↓
Validated Ready Package
              ↓
MarkOrbit Core
```

## 3. Control plane

MarkOrbit Knowledge owns:

- Workspace and data-domain boundaries;
- Source Registry;
- Connector Registry;
- Collection plans and declarative policy;
- job intent and future scheduling metadata;
- RawArtifact registry and version chain;
- conversion and Vault synchronization coordination;
- validation, audit and Ready Package publication.

## 4. Execution plane

Execution providers own bounded task execution:

- Mo Crawl executes web acquisition;
- Crawl4AI is the default web engine behind a replaceable adapter;
- Local Worker scans authorized local sources;
- API, email and document connectors execute their declared capabilities;
- converter workers transform immutable artifacts into staging documents.

Workers receive declarative requests only. A request can select a known connector, capability and validated configuration, but cannot carry arbitrary executable code, shell commands or scripts.

## 5. Contract boundary

Schema v1 locks the portable contract for:

- Workspace;
- ConnectorManifest;
- CollectionPlan;
- SourceDefinition;
- RawArtifact.

These contracts are independent from:

- API endpoint versions;
- database table layouts;
- UI view models;
- job scheduler implementation;
- Obsidian plugin choices;
- MarkOrbit Core semantic contracts.

## 6. Raw evidence

RawArtifact is an immutable evidence record. The byte payload may live in local storage, S3-compatible storage, another object store or a controlled remote reference. The contract stores only a stable URI and hashes.

A content change creates a new artifact ID and version. Version 2 or later must reference the artifact it supersedes. Conversion never mutates raw evidence.

## 7. Secrets

ConnectorManifest describes which credentials a provider needs. SourceDefinition stores only a `secretRef`. Secret values are resolved at execution time by an authorized runtime and are never written to source configuration, artifact metadata, logs, Vault Markdown or Ready Packages.

## 8. Extensibility

Unknown top-level properties are rejected to keep contracts deterministic. Provider-specific optional metadata is allowed only under `extensions`, using `x-` namespaced keys. Core behavior must not depend on an extension without first promoting it into a reviewed schema field.

## 9. Data domains and synchronization

Workspace determines the data boundary:

- `PUBLIC`;
- `ORGANIZATION`;
- `WORKSPACE_PRIVATE`;
- `USER_LOCAL`.

Knowledge synchronization modes are:

- `RAW`: raw evidence and derived staging data may synchronize;
- `METADATA`: raw bytes remain outside the central store;
- `LOCAL_ONLY`: acquisition and staging stay local.

`VALUE_ONLY` is intentionally excluded because value objects belong to MarkOrbit Core.

## 10. Deferred implementation choices

Schema v1 does not select:

- PostgreSQL or an ORM;
- queue or lease technology;
- object-storage product;
- authentication provider;
- Vault filesystem transport;
- full JSON Schema validation library.

These implementation decisions must conform to the locked contracts rather than redefining them.
