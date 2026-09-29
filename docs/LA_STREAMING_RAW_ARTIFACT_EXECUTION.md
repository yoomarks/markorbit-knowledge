# Governed streaming RawArtifact execution boundary

This is a generic optional Worker executor, not a new scraper or source store.
A claimed immutable Job may use it only when its Connector explicitly opts
in through isStreamingJob(context) AND supplies acquireBatches(context).
Every existing acquisition retains the original bulk executor by default.

The streaming executor starts the normal authenticated Worker execution,
keeps the existing Worker Protocol lease and heartbeat in the controlled
runtime, and applies the same authorized artifact-kind, content, lineage,
session-upload and finalize calls as existing RawArtifact ingestion.
It fully finalizes all artifacts of one bounded batch before asking the
Connector generator for another batch. A failed provider page stops the
Job; previously finalized immutable RawArtifacts remain in Knowledge, but
the failed Job never receives a success receipt.

Per-Job hard caps are 2,000 batches, at most 16 artifacts per batch,
8,000 artifacts total, and 512 MiB prepared artifact bytes. Each canonical
URI may occur only once per Job. Parent RawArtifact identities must be
resolved before child finalization. Source-specific rate limits, network
destinations, official access terms, and resumable source-ID checks remain
the Connector's responsibility. The executor cannot call Data Engine.

For Lao index evidence, the page request depends on the ID projection,
and the checkpoint depends on the prepared admission request. A finalized
checkpoint therefore implies the whole page's source and request evidence
has been finalized, but NEVER means the Data Engine has admitted the facts.
A separately governed publisher needs a genuine grant, lease and owner
receipt, and full-country completion needs a separate all-page/frozen-ID
coverage proof.

This code changes no production Worker enrollment, source plan, operator
switch, scheduler, source URL, ClickHouse table, or customer workspace.
LA full mode remains default OFF pending #903's real authenticated pilot
and reviewed #907 full-index Work.
