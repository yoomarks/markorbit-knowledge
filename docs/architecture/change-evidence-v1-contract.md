# Change Evidence V1 contract guarantees

The V1 contract is intentionally evidence-only.

- `before` and `after` identify immutable document lineage through RawArtifact, Staging, ReadyPackage, content digest, version, capture time and source URI.
- `dimensions` contains only changes derivable from persisted document versions and their recorded section diff.
- `metadataChanges` compares a bounded, explicit metadata field set.
- `links` contains normalized absolute HTTP(S) URLs observed in changed canonical text.
- `coverage` states which evidence dimensions are actually supported rather than using empty arrays as proof of unsupported observations.
- Attachment changes are not claimed until acquisition-layer attachment identity is available.

The contract must not grow fields for importance, legal effect, recommendation, urgency or user-facing narrative. Those semantics belong downstream.
