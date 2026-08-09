# M3.4 — Document Change Feed and Version Diff

## Purpose

M3.4 delivers source-document changes to MO after verified Canonical Markdown has been indexed. It reports observable document-content changes only; it does not interpret legal effect, applicability, deadlines, rules or case impact.

```text
Verified Canonical Markdown vN
        ↓
Retrieval Index vN
        ↓
Compare with nearest prior indexed version
        ↓
DocumentChangeEvent
        ├── CREATED
        ├── UPDATED
        └── UNCHANGED
        ↓
Cursor Change Feed → MO
```

## Event boundary

Only a newly indexed **current** retrieval version emits a change event. Historical/out-of-order versions remain retrievable, but do not create retrospective feed events when a newer current version already exists.

Recording is idempotent by the target Staging document/version. Replaying the same verified retrieval index does not create another event.

## Deterministic comparison

Comparison uses the retrieval layer's heading-aware chunks. Contiguous chunks with the same exact heading path are grouped into section snapshots. Repeated heading paths are distinguished by occurrence order rather than merged.

Section changes are deliberately limited to:

- `ADDED`
- `REMOVED`
- `MODIFIED`

The comparison does not infer semantic equivalence, legal significance or professional meaning.

A version is:

- `CREATED` when no earlier indexed version exists;
- `UNCHANGED` when the normalized document sections are byte-equivalent even if canonical frontmatter/provenance changed;
- `UPDATED` when one or more normalized sections changed.

This distinction is important because a new RawArtifact/version naturally changes Canonical Markdown provenance fields even when the source body is unchanged.

## Provenance

Every event carries:

- Workspace and Source identity;
- logical/document identity;
- prior/current artifact version;
- prior/current Staging document identity;
- prior/current canonical content SHA-256;
- observed/indexed timestamp;
- counts of added, removed and modified sections.

Explicit version comparison additionally returns exact before/after section text, chunk IDs and section hashes. These are evidence-oriented diffs, not legal conclusions.

## MO read APIs

```text
GET /api/changes/feed
  ?workspaceId=...
  &cursor=cf_...
  &sourceId=...
  &documentId=...
  &limit=50

GET /api/changes/documents/{documentId}/diff
  ?workspaceId=...
  &fromVersion=1
  &toVersion=2
```

`fromVersion` may be omitted for a creation comparison against no prior version.

The feed cursor is a monotonic checkpoint over persisted event sequence. Clients should store the returned cursor and supply it on the next request.

## Semantic boundary

M3.4 does not answer questions such as:

- whether a source change changes trademark law;
- which cases are affected;
- which deadline should be recalculated;
- whether a prior rule is superseded;
- what action a user should take.

Those interpretations belong in MO. MarkOrbit Knowledge supplies the changed source material, exact version provenance and deterministic diff needed for MO to decide what the change means.
