# ConversionRun Ledger

## Responsibility

Migration `0009_conversion_run_ledger` adds the first durable control-plane boundary for Conversion Execution Protocol v1. The ledger stores validated canonical `ConversionRun` JSON as the authority and uses structured SQLite columns only for filtering, ordering, idempotency and concurrency.

## Runtime boundary

Manual Dispatch records conversion intent only. It does not execute a Converter, generate Markdown or YAML, create Staging Document persistence, schedule retries, write Vault data, or invoke MarkOrbit Core semantic processing. A newly created run remains `PENDING` with the administration message `Awaiting conversion runtime` until a future runtime protocol is implemented.

## Controlled Manual Dispatch helper reads

The administration UI no longer defaults to arbitrary RawArtifact and ConversionProfile ID entry. It uses read-only helper APIs to select eligible inputs before POSTing a dispatch request:

- `GET /api/raw-artifacts/eligible-for-conversion?workspaceId=...` returns only Workspace-scoped `READY_FOR_CONVERSION` RawArtifact summaries with evidence metadata: id, source, kind, MIME, SHA-256, size and capture/create/version timestamps. It does not expose raw bytes, storage filesystem paths, Source secrets or provider credentials.
- `GET /api/raw-artifacts/:id/compatible-conversion-profiles?workspaceId=...` recomputes server-side compatibility for the selected artifact: Workspace, optional Source scope, ACTIVE profile, exact ACTIVE manifest, artifact kind, MIME, output format and target template.

The helper responses are convenience reads only. `POST /api/conversion-runs` always repeats the full compatibility validation and must not trust stale helper results.

## API validation boundary

ConversionRun API routes parse untrusted JSON and query parameters with explicit validators before calling persistence. The boundary rejects root and nested unknown fields, arrays/null where objects are required, malformed `requestedOutput`, non-`MARKDOWN` formats, unsafe target path templates, malformed actor type/id values, invalid filters and secret/command/script/executable field families. Errors use the stable API error envelope.

`GET /api/conversion-runs/:id` requires `workspaceId` as a query parameter so detail reads do not cross Workspace boundaries in the local-only reference adapter.

## Manual Dispatch transaction

A dispatch validates the RawArtifact, active exact ConversionProfile, active exact ConverterManifest, artifact kind, MIME type, requested output and target path template before constructing snapshots. It computes an immutable dispatch-intent digest, inserts one `PENDING ConversionRun`, inserts sequence `1` `CREATED` event and commits both in one `BEGIN IMMEDIATE` database transaction. If the event insert fails after the run insert, SQLite rollback leaves neither a half-created run nor an orphan event.

## Immutable snapshots

The run JSON embeds RawArtifact input evidence, the complete ConversionProfile snapshot, the complete ConverterManifest snapshot, requested output, trigger, actor and idempotency identity. Later SourceDefinition, ConversionProfile or ConverterManifest registry changes do not rewrite existing run history.

## Workspace-scoped idempotency and concurrency

`conversion_runs` enforces `UNIQUE (workspace_id, idempotency_key)`. The same key and digest replays the original run. The same key with a different immutable intent returns `CONVERSION_IDEMPOTENCY_CONFLICT` after compatibility validation. The digest covers Workspace, RawArtifact, ConversionProfile, requested output, trigger and immutable input evidence.

Concurrent dispatch uses SQLite `BEGIN IMMEDIATE` plus the unique constraint. Multiple repository instances pointed at the same SQLite file converge to one run and one `CREATED` event for identical requests; conflicting concurrent requests leave one winning intent and one stable conflict.

## Append-only events and concurrent cancellation

`conversion_execution_events` stores validated event JSON and enforces unique event IDs plus unique `(run_id, sequence)`. The repository exposes append paths for `CREATED` and `CANCELLED` only; it does not expose update or delete event paths.

Administrators may cancel only `PENDING` runs. Cancellation re-reads the run and events after `BEGIN IMMEDIATE`, computes the next sequence while holding the SQLite write lock, appends one `CANCELLED` event, and updates the canonical run JSON plus indexed terminal timestamps in a single transaction. Concurrent cancellation produces one success and one stable non-cancellable conflict; terminal events are not duplicated.

## Restart persistence

Runs and events are durable SQLite records. Reopening the same database file preserves canonical JSON, immutable snapshots and event ordering. Replaying the same idempotency request after restart returns the original run and does not append a second `CREATED` event.

## Route strategy

The internal Admin module key remains `conversionRuns` for shell composition. Public URL paths and navigation use kebab-case `/conversion-runs`, including `/conversion-runs/dispatch` and `/conversion-runs/:id`.

## Tests and guarantees

The ledger has dedicated persistence tests using real SQLite repositories and real migrations for migration idempotency, dispatch, rollback, idempotent replay, restart persistence and concurrent cancellation. API validation tests cover the structured request boundary. Helper API and UI flows remain control-plane selection and confirmation; they do not implement Conversion Runtime.

## Deferred work

Converter runtime transitions, Markdown/YAML generation, Staging persistence, Scheduler, Retry, OCR/PDF/DOCX parsing, Crawl4AI, Obsidian synchronization and MarkOrbit Core semantic logic remain unimplemented.
