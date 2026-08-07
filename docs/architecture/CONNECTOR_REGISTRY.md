# Connector Registry

## Purpose

The Connector Registry stores versioned Schema v1 `ConnectorManifest` records. A manifest describes what a Connector claims to support and the configuration contracts required to bind a SourceDefinition.

It does not install, import or execute Connector code.

```text
Connector administration UI
          ↓
/api/connectors
          ↓
ConnectorRepository
          ↓
SQLite reference adapter
          ↓
Immutable ConnectorManifest versions
          ↓
SourceDefinition compatibility validation
```

## Three separate truths

MarkOrbit Knowledge keeps three concepts separate:

1. **Registry metadata** — a ConnectorManifest version exists and passed Schema v1 validation.
2. **Worker availability** — an authorized execution node reports that it can run a compatible implementation.
3. **Health evidence** — a recent probe or execution produced evidence about current connectivity and behavior.

KNOWLEDGE-TASK-004 implements only the first concept. The UI therefore displays runtime health as `NOT_EVALUATED` and does not present a successful registry entry as a healthy worker.

## Version identity and immutability

A ConnectorManifest is identified by:

```text
connectorId + version
```

Examples:

```text
crawl4ai-web@1.0.0
json-api@2.1.0
```

Once registered, a version is immutable except for its lifecycle status. Changes to Runtime, Source Types, Capabilities, Job Types, configuration schema, secret schema, output artifacts or health-check declaration require a new semantic version.

This prevents a SourceDefinition bound to `connectorId@version` from silently changing meaning.

## Lifecycle status

Schema v1 supports:

- `ACTIVE` — available for new SourceDefinition bindings;
- `DEPRECATED` — retained for existing bindings, but not offered for new bindings;
- `DISABLED` — retained for audit and historical resolution, but not offered for new bindings.

Changing lifecycle status does not mutate the remaining Manifest contract.

## SourceDefinition binding rules

A new SourceDefinition or changed Connector binding must satisfy all of the following:

1. the exact ConnectorManifest version is registered;
2. the Manifest status is `ACTIVE`;
3. the SourceDefinition `sourceType` is included in the Manifest `sourceTypes`;
4. the SourceDefinition itself remains valid under Schema v1.

An existing SourceDefinition may keep a `DEPRECATED` or `DISABLED` exact binding while unrelated fields are edited. Moving a non-active SourceDefinition back to `ACTIVE`, changing its Source Type or changing its Connector binding requires an active compatible Manifest.

This preserves historical readability without allowing stale versions to become new operational choices.

## Persistence model

The SQLite reference adapter stores:

- complete canonical ConnectorManifest JSON;
- Connector ID and version;
- display name;
- Runtime;
- lifecycle status;
- indexed JSON arrays for Source Types, Capabilities, Job Types and Artifact Kinds;
- internal registration and update timestamps.

The complete Schema v1 JSON document remains authoritative. Indexed columns exist only for querying and usage counts.

SourceDefinition rows store both Connector ID and exact Connector version so usage can be measured without parsing every document.

## Bootstrap Manifest

A clean database registers the locked fixture:

```text
crawl4ai-web@1.0.0
```

This is registry metadata only. It does not imply that Crawl4AI, Python or a compatible Worker is installed.

## Registering a new version

1. Choose a stable lowercase Connector ID.
2. Select a semantic version.
3. Declare supported Source Types, Capabilities and Job Types.
4. Declare non-secret configuration as JSON Schema-like metadata.
5. Declare secret requirements separately in `secretSchema`.
6. Declare output Artifact Kinds and health-check mode.
7. Validate and register the Manifest.
8. Bind Sources only after the version appears as `ACTIVE` and compatible.

Do not put credentials, commands, script bodies, module paths, package installers or container execution instructions in a Manifest.

## Security boundary

ConnectorManifest is not a plugin package. The Registry does not evaluate fields as code, import modules, invoke shell commands, pull container images or resolve secrets.

Future Worker Runtime components must authenticate workers, match capabilities, resolve approved implementations and record health evidence independently from this registry.

## Deferred capabilities

This task does not implement:

- Connector installation;
- worker registration or heartbeat;
- health probes;
- connection tests;
- discovery, preview or collection execution;
- Crawl4AI integration;
- scheduling or leases;
- RawArtifact storage;
- Obsidian synchronization;
- Ready Package construction;
- MarkOrbit Core semantics.
