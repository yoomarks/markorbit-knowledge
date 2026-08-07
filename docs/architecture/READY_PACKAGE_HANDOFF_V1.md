# Ready Package Manifest & Handoff Registry v1

## Purpose

Ready Package is the explicit local handoff boundary after conversion and staging verification. It does not perform Obsidian writes or MarkOrbit Core processing.

## Eligibility

Preparation first verifies the complete TASK-027 Evidence Bundle. A package is eligible only when:

- Conversion terminal status is `COMPLETED`;
- observed phase is `COMPLETED`;
- Staging document status is `READY`;
- verification outcome is `PASS` or `PASS_WITH_WARNINGS`.

Failed or blocked runs cannot be packaged.

## Files

Preparation creates two files in the run root:

- `ready-package.json`: canonical immutable handoff manifest;
- `ready-package-registry.jsonl`: append-only local handoff registry.

The manifest binds Workspace, Source, ConversionRun, Staging document, Staging content SHA-256, verifier identity, run-manifest digest and evidence-bundle digest.

`packageId` is deterministic from Workspace, ConversionRun, Staging document and Staging content digest. Re-preparing the same run is rejected.

## Commands

```bash
pnpm --filter @markorbit/integration-tests prepare:ready-package --root ./tmp/manual-run
pnpm --filter @markorbit/integration-tests verify:ready-package --root ./tmp/manual-run
```

CLI output is redacted and contains only package, run, staging and digest identifiers.

## Integrity

`ready-package.json` uses canonical JSON and SHA-256. Verification also requires a matching append-only registry record and re-verifies the underlying Evidence Bundle.

## Exclusions

This version does not include scheduling, HTTP APIs, cloud publishing, Obsidian writes, AI extraction, semantic analysis or MarkOrbit Core behavior.
