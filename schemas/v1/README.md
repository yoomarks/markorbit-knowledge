# MarkOrbit Knowledge Schema v1

This directory is the canonical, implementation-independent contract for MarkOrbit Knowledge acquisition and staging objects.

## Canonical objects

- `workspace.schema.json`
- `connector-manifest.schema.json`
- `collection-plan.schema.json`
- `source-definition.schema.json`
- `raw-artifact.schema.json`

All schemas use JSON Schema Draft 2020-12 and reference shared definitions from `common.schema.json`.

## Authority

The JSON Schemas define wire and file compatibility. TypeScript contracts in `packages/contracts` mirror these schemas and provide lightweight runtime guards, but do not replace a full standards-compliant JSON Schema validator at external trust boundaries.

## Version policy

`schemaVersion` is independent from API and application versions.

Backward-compatible v1 changes may:

- add optional fields;
- add optional `x-` extension metadata;
- clarify descriptions without changing validation semantics.

A new major schema version is required to:

- add a required field;
- remove or rename a field;
- change an identifier pattern;
- remove an enum value;
- change the meaning of an existing value;
- weaken raw-artifact provenance or immutability requirements.

Unknown top-level fields are rejected. Provider-specific data belongs under `extensions`, where keys must begin with `x-`.

## Security boundary

Source connector configuration may contain non-secret declarative values only. Credential material is represented by `secretRef`; secret values must remain in a dedicated secret store. Connector manifests describe secret requirements but never contain credentials.

## Raw artifact rule

A RawArtifact is immutable evidence. Any byte change creates a new `id` and incremented `version`, linked through `supersedesArtifactId`. Storage URIs must be stable internal references and must not contain embedded credentials or expiring signed URLs.
