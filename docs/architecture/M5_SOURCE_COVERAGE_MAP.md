# M5 — Source Coverage Map

## Purpose

The Source Coverage Map defines which foundational public trademark sources MarkOrbit Knowledge intends to represent and keep observable over time.

It answers a different question from Source Registry, Source Intelligence, and Collection Plans:

- **Source Coverage Map:** Which source families should exist in the foundational source layer?
- **Source Registry:** Which concrete Sources have actually been registered in a workspace?
- **Source Intelligence:** What has been observed about a Source and its evidence maturity/value?
- **Collection Plan:** What acquisition behavior has been explicitly configured and authorized?

The catalog is therefore a coverage-intent layer, not an execution layer.

## Hard boundary

A `SourceCoverageTarget`:

- does not create a `SourceDefinition`;
- does not create or activate a `CollectionPlan`;
- does not authorize collection;
- does not grant scheduler permission;
- does not infer authority from a hostname or `.gov` suffix;
- does not certify legal truth;
- does not create legal rules, requirements, deadlines, applicability logic, or final answers.

`authorityName`, `category`, and `authorityLevel` are explicitly curated catalog metadata. `authorityBasis` is fixed to `EXPLICIT_CURATED` so consumers do not mistake those values for domain inference.

Acquisition fields are hints for later human/configuration work only. For example, `fetchAttachmentsHint: true` means the source family is expected to contain useful attachments; it does not turn attachment collection on.

## US baseline v1

The first catalog establishes 17 USPTO source targets across these source families:

- portal;
- filing;
- search;
- status and documents;
- examination manual;
- TTAB procedure;
- goods/services identification;
- fees;
- assignments;
- registration maintenance;
- TTAB proceedings;
- Trademark Official Gazette;
- system status;
- policy notices.

The baseline intentionally includes both durable foundational sources and explicit change-signal sources. Current/manual and archive/distribution endpoints can coexist when they serve different acquisition or provenance needs.

## Tiers

### FOUNDATIONAL

Sources MO should normally be able to retrieve from the foundational source layer without going back to the public web for basic source gathering.

### SUPPORTING

Official distribution, archive, or operational sources that improve evidence completeness, historical coverage, attachment access, or provenance.

### CHANGE_SIGNAL

Official pages whose main value is detecting potentially meaningful source changes. The Knowledge system reports the source/document change; MO decides the legal or case meaning.

## Registration gap evaluation

`evaluateSourceCoverage()` compares catalog target URIs with registered `SourceDefinition` canonical URIs and entrypoints. It returns only:

- `REGISTERED`, with matching Source IDs; or
- `UNREGISTERED`.

It performs no automatic registration or execution. This makes the catalog operationally useful while preserving the human/explicit authorization boundary.

## API

`GET /api/source-coverage`

Supported catalog filters:

- `jurisdiction`
- `family`
- `coverageTier`
- `catalogState`

When `workspaceId` is provided, the response also includes registration coverage against that workspace's existing Source Registry.

`GET /api/source-coverage/{id}` returns one catalog target and, when `workspaceId` is supplied, its registration state.

## Global expansion

The contract is jurisdiction-neutral. Additional jurisdictions and international organizations should be added through the same version-controlled catalog model rather than by adding jurisdiction-specific legal semantics.

A future global expansion should focus on source coverage completeness and acquisition feasibility. Professional rule interpretation remains outside `markorbit-knowledge` and belongs in MO.
