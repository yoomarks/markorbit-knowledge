# ADR-0004: Immutable semantic-versioned ConnectorManifest records

- **Status:** Accepted
- **Date:** 2026-07-16

## Context

SourceDefinitions refer to a Connector by exact `connectorId` and `version`. If a registered version could later change its Runtime, capabilities, configuration schema or output contract, existing Sources would silently acquire different behavior while retaining the same identity.

The project also needs to avoid treating declarative registry metadata as executable plugin code or current worker-health evidence.

## Decision

1. Persist ConnectorManifest records by the composite identity `(connectorId, version)`.
2. Use semantic versions for contract identity.
3. Treat all Manifest fields as immutable after registration except lifecycle `status`.
4. Require a new version for changes to Runtime, Source Types, Capabilities, Job Types, schemas, output kinds, health-check declaration or extensions.
5. Allow only `ACTIVE` versions for new or changed SourceDefinition bindings.
6. Preserve exact deprecated or disabled bindings for historical resolution and unrelated SourceDefinition edits.
7. Require an active compatible version when activating a previously inactive Source, changing Source Type or changing Connector binding.
8. Represent runtime health as separate evidence; a registered Manifest has `NOT_EVALUATED` runtime health until a future authorized worker probe exists.
9. Keep ConnectorManifest declarative and reject non-Schema-v1 top-level execution fields.

## Consequences

### Positive

- Exact Source bindings remain reproducible.
- Version history and usage counts are meaningful.
- Deprecation does not destroy historical references.
- UI and API can distinguish contract registration from worker availability.
- Future execution implementations can be replaced without redefining SourceDefinition contracts.

### Costs

- Small corrections to a registered Manifest require a new version.
- Operational health requires a separate worker and evidence model.
- Deprecated versions remain stored while referenced.
- Semantic-version governance becomes part of Connector publishing.

## Rejected alternatives

### Mutable Connector rows keyed only by Connector ID

Rejected because Sources would silently change behavior and compatibility after edits.

### Treating Manifest as an installable plugin descriptor

Rejected because it would mix contracts, package distribution, code trust, secrets and runtime execution in one object.

### Deriving health from registry status

Rejected because `ACTIVE` means available for binding, not installed, reachable or currently healthy.

### Deleting deprecated versions

Rejected because it would break auditability and exact historical Source bindings.
