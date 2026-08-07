# Local Evidence Bundle Verification & Export v1

## Purpose

TASK-027 adds a deterministic, local-only evidence bundle boundary around one completed manual fixture run. It does not create a production archive format or a Ready Package.

The bundle root contains the existing runtime evidence plus `evidence-bundle.json`.

## Included evidence

The exporter includes only regular files from these approved locations:

- `run-manifest.json`
- `knowledge.sqlite`
- `raw-artifacts/**`
- `staging-cas/**`

Each entry records a canonical relative path, role, byte size and SHA-256 digest. Paths outside the bundle root, symbolic links and unsupported file types are rejected.

## Bundle envelope

```json
{
  "schemaVersion": "1.0.0",
  "objectType": "LOCAL_EVIDENCE_BUNDLE",
  "generatedAt": "...",
  "manifest": {
    "path": "run-manifest.json",
    "sha256": "..."
  },
  "files": [],
  "digest": {
    "algorithm": "SHA-256",
    "value": "..."
  }
}
```

The bundle digest is computed over canonical JSON for the unsigned envelope. The exporter uses exclusive temporary-file creation followed by atomic rename and never overwrites an existing bundle.

## Verification

```bash
pnpm --filter @markorbit/integration-tests verify:evidence --root ./tmp/manual-run
```

Verification performs all of the following:

1. validates the bundle envelope and bundle digest;
2. validates `run-manifest.json` using TASK-026 rules;
3. confirms the manifest digest bound in the bundle;
4. re-enumerates the approved file set;
5. confirms exact path, role, size and SHA-256 equality;
6. rejects missing, additional, modified, traversing or symlinked entries.

The command emits a redacted JSON result containing only root path, bundle path, file count, total bytes and public digests.

## Boundaries

TASK-027 does not add scheduler behavior, polling, retry, HTTP APIs, cloud object storage, signing keys, encryption, Obsidian writes, Ready Package semantics, AI extraction, semantic processing or MarkOrbit Core behavior.
