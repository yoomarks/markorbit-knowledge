# Change Evidence V1 operator notes

Change Evidence is read from persisted document change events; it does not require a second collection pass or a separate evidence database.

Use the evidence feed after a document version has been indexed and recorded by `SqliteDocumentChangeFeedRepository.recordIndexedVersion`. Consumers should retain the evidence `id`, `eventId`, before/after content digests, and provenance references when forwarding objective change facts downstream.

An `UNCHANGED` document change event can still contain `METADATA_CHANGED` evidence when canonical content is unchanged but authoritative indexed metadata differs. Array-valued metadata such as jurisdictions and languages is normalized as a set, preventing order-only noise.

`coverage.linkedAttachments=false` is intentional. Operators must not interpret it as “no attachments changed”; it means attachment change evidence is not proven by V1.
