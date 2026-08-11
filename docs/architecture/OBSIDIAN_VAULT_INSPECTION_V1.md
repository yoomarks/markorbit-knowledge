# Obsidian Vault Inspection V1

## Purpose

R1-K08 establishes a **read-only** Vault → Knowledge observation boundary.

It allows an operator to inspect Markdown files inside the current ACTIVE Workspace Vault Binding and persist immutable inspection evidence. It does **not** import file contents into Staging, mutate Source/ReadyPackage objects, overwrite Vault files, or authorize two-way synchronization.

## Flow

```text
MARKORBIT_OBSIDIAN_VAULT_ROOT
  + ACTIVE VaultBindingV1.relativeRoot
  ↓ explicit operator scan
bounded read-only Markdown traversal
  ↓
VaultInspectionRunV1
  ↓
UNCHANGED | IMPORT_CANDIDATE | CONFLICT | MISSING
```

The filesystem scan is side-effect free. The only write performed by K08 is the immutable SQLite inspection evidence after a successful scan.

## Classification

For the current binding directory, each Markdown path is compared with the latest successful durable Vault Export evidence known to Knowledge.

- `UNCHANGED`: a managed path exists and its current SHA-256 equals the exported content hash.
- `CONFLICT`: a managed path exists but its current SHA-256 differs from the exported content hash.
- `MISSING`: a previously managed path under the current binding no longer exists.
- `IMPORT_CANDIDATE`: a Markdown file exists but has no successful managed export evidence for that path.

These are observations only. None of the four classifications authorizes an import, merge, restore, overwrite or delete operation.

## Frozen evidence

Each `VaultInspectionRunV1` records:

- Knowledge Workspace ID;
- SHA-256 fingerprint of the configured absolute server Vault root, never the absolute path itself;
- Vault binding ID, revision and portable relative root;
- observation timestamp;
- sorted per-path candidate evidence;
- current file SHA-256 and size when a file exists;
- latest managed export run/staging/hash evidence when applicable;
- bounded simple frontmatter metadata;
- bounded Wiki Link targets.

Inspection snapshots are immutable. Repeating a scan creates another observation rather than rewriting history.

## Filesystem safety

K08 never creates the configured Vault root or bound directory. Missing directories therefore cannot be mistaken for successful read access.

The scanner:

- requires an ACTIVE binding;
- requires an existing absolute server root;
- rejects a symlink server root and checks every existing binding-path segment for symlink/non-directory traversal;
- rejects symbolic links encountered inside the scanned tree;
- reads regular `.md` files only;
- skips Obsidian/Git metadata trees (`.obsidian` and `.git`) while treating other Markdown paths consistently with the export path policy;
- limits recursion depth to 12;
- limits one scan to 500 Markdown files;
- limits one Markdown file to 2 MB;
- limits total Markdown bytes read to 20 MB;
- requires valid UTF-8;
- never writes, renames, removes or changes timestamps of Vault files.

## Frontmatter V1

K08 intentionally does not claim general YAML round-trip support.

The inspection parser recognizes only a bounded flat frontmatter subset:

```yaml
---
title: Example
source: manual
---
```

It reports one of:

- `NONE`
- `PARSED_SIMPLE`
- `UNSUPPORTED`
- `MALFORMED`

Complex/nested YAML, block scalars, anchors, aliases, tags and flow collections are not interpreted. Unsupported or malformed frontmatter produces no interpreted field values, preventing a partial YAML parser from becoming semantic truth.

## Wiki Links

Inspection extracts at most 100 `[[target]]` / `[[target|alias]]` targets per Markdown file. This is read-only evidence for later review/import design. K08 does not resolve links, create graph edges or mutate Knowledge objects from them.

## Persistence

Migration `0024_vault_inspection_runs` stores one immutable JSON document per inspection run. There is no PENDING state because the scan itself has no external side effect: if a read or persistence operation fails, the operator can safely run another inspection.

## Non-goals

R1-K08 does not implement:

- Vault → Staging import;
- Source creation from Vault files;
- automatic conflict resolution;
- YAML round-trip mutation;
- Wiki Link graph mutation;
- deletion propagation;
- restoring missing files;
- automatic polling/scheduling;
- Git sync;
- two-way synchronization;
- semantic/AI interpretation;
- MarkOrbit Core behavior.

A later milestone may add **explicit reviewed import intent** using K08 evidence. It must not turn `IMPORT_CANDIDATE` or `CONFLICT` into an automatic mutation.
