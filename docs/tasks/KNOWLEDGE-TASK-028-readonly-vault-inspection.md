# KNOWLEDGE-TASK-028 — Read-only Vault Inspection

Status: implemented on `r1-k08-readonly-vault-inspection`

## Objective

Establish the first Vault → Knowledge boundary as explicit, bounded and read-only observation before any import or two-way synchronization is authorized.

## Acceptance

- explicit operator-triggered scan only;
- ACTIVE Workspace Vault Binding required;
- configured root and binding path never exposed as an absolute browser-visible path;
- scanner never creates directories or mutates Vault files;
- symlinks fail closed;
- bounded Markdown count, size, total bytes and recursion depth;
- valid UTF-8 required;
- immutable `VaultInspectionRunV1` evidence persisted;
- managed paths classified as `UNCHANGED`, `CONFLICT` or `MISSING` from successful Vault Export evidence;
- untracked Markdown classified as `IMPORT_CANDIDATE`;
- simple frontmatter and Wiki Link metadata are observations only;
- no Import / Apply / Merge / Delete / Restore action exists in API or UI;
- Node 22/24 validation and UI Preview remain green.

## Follow-up

R1-K09 may define an explicit reviewed Vault import intent using frozen K08 inspection evidence. It must remain human-triggered and must not silently mutate canonical Knowledge state from filesystem changes.
