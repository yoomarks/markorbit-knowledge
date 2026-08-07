# Local Obsidian Vault Handoff Consumer v1

## Purpose

This boundary consumes one verified Ready Package into a local Obsidian-compatible Vault directory. It is a downstream, explicitly invoked file consumer. It is not part of Worker execution and does not change ConversionRun, Staging, verification, Evidence Bundle or Ready Package state.

## Required chain

The consumer accepts only this chain:

```text
Verified Evidence Bundle
  -> verified Ready Package
  -> unique Staging CAS Markdown object
  -> controlled Vault Inbox target
  -> append-only consumption receipt
```

Before any Vault write, the consumer re-runs TASK-027 Evidence Bundle verification and TASK-028 Ready Package verification.

## Target policy

The default allowed prefix is `00_Inbox/`. The Ready Package target must:

- be a relative slash-separated path;
- remain below the configured Vault root;
- start with the allowed Inbox prefix;
- end in `.md`;
- contain no empty, dot, parent, NUL or backslash segments;
- traverse no symbolic links.

## Source resolution

The consumer reads `evidence-bundle.json` only after bundle verification. Exactly one file with role `STAGING_CAS` must match the Ready Package `stagingSha256`. The object must be a regular file and its bytes must reproduce the expected SHA-256.

## Write and replay semantics

A missing target is written through an exclusive temporary file and atomic rename. An existing regular file with the same SHA-256 is an exact replay and is not rewritten. Any different existing content, directory, special file or symbolic link is a conflict.

The Vault stores an append-only receipt at:

```text
.markorbit/ready-package-consumption.jsonl
```

The receipt binds Package ID and digest, ConversionRun, Staging document, target path and Markdown digest. It contains no Worker credential, lease token, RawArtifact body or Markdown body.

## Commands

```bash
pnpm --filter @markorbit/integration-tests consume:ready-package \
  --root ./tmp/manual-run \
  --vault ./my-vault

pnpm --filter @markorbit/integration-tests verify:vault-handoff \
  --root ./tmp/manual-run \
  --vault ./my-vault
```

## Explicit non-goals

- bidirectional Vault synchronization;
- Obsidian plugin or API integration;
- file watching or scheduler behavior;
- overwriting edited notes;
- metadata extraction, linking or indexing;
- MarkOrbit Core ingestion;
- AI or semantic processing;
- remote or cloud Vault transport.
