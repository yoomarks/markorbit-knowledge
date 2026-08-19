# Change Evidence V1

Change Evidence V1 is the objective evidence layer above the existing `DocumentChangeFeed` and Retrieval Index. It does not decide whether a change is legally, commercially, or editorially significant; that interpretation belongs downstream in Core/Brain.

## Evidence boundary

For every persisted document change event, the evidence projection resolves the immutable before/after indexed versions and records:

- RawArtifact, Staging document, ReadyPackage and content digest lineage;
- canonical text and section changes already recorded by `DocumentChangeFeed`;
- objective document metadata changes;
- added and removed absolute HTTP(S) links observed in changed canonical sections;
- section additions, removals and modifications;
- whether document structure changed through section addition/removal.

Evidence is derived from persisted records and fails closed when the event, diff and indexed document provenance disagree.

## Explicitly unsupported in V1

Linked-attachment change detection is not inferred from filenames, link text, or URL suffixes. `coverage.linkedAttachments` remains `false` until attachment identity and lineage are represented by authoritative acquisition evidence.

Likewise, Change Evidence V1 does not assign importance, legal effect, urgency, recommendations, or semantic meaning. Those are Core/Brain responsibilities.
