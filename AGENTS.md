# Repository instructions for coding agents

1. Read `docs/product/MarkOrbit_Knowledge_PRD_v1.0.md`, `docs/architecture/SYSTEM_BOUNDARIES.md`, `docs/architecture/SYSTEM_ARCHITECTURE_V1.md` and `docs/architecture/SCHEMA_V1.md` before changing code.
2. Never move MarkOrbit Core information understanding, distillation, knowledge, capability, value-scoring or recommendation logic into this repository.
3. Schema v1 is locked. Any incompatible contract change requires an ADR, a new major schema directory and explicit migration planning. Database models must conform to the schema rather than redefine it.
4. Central services may issue declarative tasks only. Arbitrary remote worker code execution is forbidden.
5. Preserve RawArtifact immutability, hashes, provenance and version chains.
6. Never place credentials in SourceDefinition, ConnectorManifest, RawArtifact, logs, fixtures or Vault content. Use secret references only.
7. Keep connectors, converters, storage providers and execution providers replaceable behind MarkOrbit contracts.
8. Unknown top-level contract fields are prohibited. Optional provider metadata must use `extensions` with `x-` namespaced keys.
9. Fixture/demo data must be clearly labeled and must never be represented as a real acquisition result.
10. Run `pnpm check` before opening or updating a pull request.
11. Use a feature branch and Draft PR. Do not commit directly to `main` and do not self-merge unless the user explicitly instructs it.
