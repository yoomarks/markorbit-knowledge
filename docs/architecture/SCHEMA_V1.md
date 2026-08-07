# MarkOrbit Knowledge Schema v1

## Status

Schema v1 is the locked acquisition-and-staging interchange contract for MarkOrbit Knowledge.

Canonical JSON Schemas live under [`schemas/v1`](../../schemas/v1/). TypeScript mirrors and runtime guards are exported by `@markorbit/contracts`.

## Contract inventory

| Contract          | Responsibility                                                               |
| ----------------- | ---------------------------------------------------------------------------- |
| Workspace         | Data ownership, visibility, synchronization and retention boundary           |
| ConnectorManifest | Replaceable provider capabilities and declarative configuration requirements |
| CollectionPlan    | When and how a SourceDefinition should be collected                          |
| SourceDefinition  | Stable source identity, classification and provider binding                  |
| RawArtifact       | Immutable evidence, provenance, hashes, storage reference and version chain  |

## Identifier policy

Business objects use prefixed ULIDs:

```text
wsp_<ULID>  Workspace
src_<ULID>  SourceDefinition
pln_<ULID>  CollectionPlan
art_<ULID>  RawArtifact
run_<ULID>  Collection run reference
doc_<ULID>  Logical document reference
sec_<ULID>  Secret reference
wrk_<ULID>  Worker reference
cnv_<ULID>  Conversion profile reference
```

Connector IDs are stable lower-kebab slugs and connector versions use semantic versioning.

## Time and jurisdiction

Timestamps are RFC 3339 UTC values ending in `Z`.

Jurisdictions are not restricted to ISO country codes because MarkOrbit must represent regional and international systems such as EUIPO, WIPO, OAPI and ARIPO. Codes are uppercase controlled identifiers owned by the future jurisdiction registry.

## Strictness and extensions

All contract roots reject unknown properties. Nested contract objects are also strict unless they intentionally carry declarative JSON, such as connector configuration schemas.

Provider-specific metadata belongs under:

```json
{
  "extensions": {
    "x-provider-name": "value"
  }
}
```

Extensions cannot alter required semantics and must not be required by generic consumers.

## Secret exclusion

`SourceDefinition.connectorConfig` accepts non-secret configuration only. Runtime guards reject common credential field names recursively. A SourceDefinition may point to a dedicated secret store with `secretRef`.

`ConnectorManifest.secretSchema` describes required secret names and constraints, but never stores secret values.

## RawArtifact invariants

1. RawArtifact evidence fields are immutable.
2. Version 1 must not contain `supersedesArtifactId`.
3. Version 2 or later must contain `supersedesArtifactId` referencing a different artifact ID.
4. Binary SHA-256 is mandatory.
5. Content SHA-256 is optional and represents normalized content, never the original byte identity.
6. Storage URI is stable and credential-free.
7. Provenance always includes a source URI.
8. Derived Markdown must reference the RawArtifact rather than replace it.

## Compatibility

Within v1, optional additive changes are permitted. Required-field additions, removals, renames, identifier changes, enum removals or semantic reinterpretations require a new major version.

Producers write exactly the fields defined by their declared version. Consumers reject unknown top-level fields but accept valid `x-` extensions. Schema version negotiation must not be inferred from API route versions.

## Validation layers

- JSON Schema is authoritative at file, API and external connector boundaries.
- TypeScript types provide compile-time safety inside Node applications.
- Runtime guards provide dependency-free validation for repository fixtures and trusted internal handoffs.
- A future infrastructure task may select a full Draft 2020-12 validator for untrusted production inputs without changing these contracts.
