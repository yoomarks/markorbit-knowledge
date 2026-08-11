# Manual Upload Ingestion V1

## Purpose

Manual Upload is a governed acquisition entry point for operator-provided files. It does not create a second artifact store, a second conversion pipeline, or an Admin-only persistence shortcut.

The production path is:

```text
Admin Manual Upload
  -> MANUAL_UPLOAD SourceDefinition
  -> MANUAL CollectionPlan
  -> CollectionRun / LOCAL_FILE_SCAN Job
  -> targeted ephemeral Worker lease
  -> controlled ExecutionAttempt
  -> Artifact Ingestion Protocol v1
  -> local content-addressed storage
  -> immutable RawArtifact
  -> existing automatic conversion dispatch
```

The resulting RawArtifact therefore has the same execution, ingestion, CAS, receipt, provenance and downstream conversion boundaries as other governed acquisition paths.

## System-owned source objects

The service lazily creates and then reuses the following immutable/control-plane objects per their existing registry rules:

- connector `builtin-manual-upload@1.0.0`;
- one active Workspace-scoped `MANUAL_UPLOAD` SourceDefinition named `Manual Uploads`;
- one active MANUAL CollectionPlan marked as the system Manual Upload plan.

The source category is `USER_PROVIDED` and its authority level is `UNKNOWN`. Uploading a file does not upgrade legal or factual authority.

## Upload contract

`POST /api/manual-uploads` accepts raw request-body bytes and requires:

- `x-markorbit-workspace-id`;
- URI-encoded UTF-8 `x-markorbit-filename`;
- `content-type`;
- `x-markorbit-content-size`;
- lowercase SHA-256 in `x-markorbit-content-sha256`;
- `idempotency-key`.

`GET /api/manual-uploads` exposes the configured byte limit and supported MIME types for the Admin client.

The default Manual Upload limit is 25 MiB and can be changed with `MARKORBIT_MANUAL_UPLOAD_MAX_BYTES`. The service checks both the declared size and the actual streamed byte count. The existing Artifact Ingestion Protocol then independently verifies observed size and SHA-256 before finalization.

## Supported media

V1 accepts the bounded media set that maps to existing artifact/conversion contracts:

- Markdown, HTML and plain text;
- PDF and DOCX;
- XLSX and CSV;
- JSON and XML;
- RFC 822 email;
- PNG, JPEG, WebP and TIFF images.

An unsupported media type fails before execution dispatch. Manual Upload does not execute uploaded content.

## Filename and path safety

The client supplies only a logical original filename. A Manual Upload filename:

- must contain 1 to 255 characters;
- must not be `.` or `..`;
- must not contain `/` or `\\`;
- must not contain C0 control characters or DEL.

The client cannot provide a server filesystem path. Raw bytes are written only through the existing Artifact Ingestion content-addressed store.

## Workspace isolation

The Workspace ID is mandatory and must already exist. System Manual Upload SourceDefinition and CollectionPlan records are Workspace-scoped, every Run/Job/Worker lease remains in that Workspace, and RawArtifact ingestion reuses the existing ownership checks.

A request cannot select another Workspace through a filename, source URI, path or artifact-store location.

## Targeted Job claim

The generic Worker claim contract intentionally selects any compatible pending Job. That is correct for ordinary worker pools but is too broad for an in-process Manual Upload: two simultaneous uploads must not exchange their newly created Jobs.

Manual Upload therefore uses an additive targeted-claim helper that preserves the existing authentication, heartbeat, compatibility, lease-token and single-active-lease rules while leasing only the exact Job created for that upload. Existing Worker claim behavior is unchanged.

## Idempotency and recovery

The external idempotency key is Workspace-scoped and is transformed into bounded internal operation keys. The following behavior is frozen for V1:

- same key plus a finalized identical upload returns the original Run and RawArtifact;
- same key plus different filename, MIME type, size or SHA-256 fails closed;
- a replay can continue when dispatch exists but execution has not yet started and the exact Job remains pending;
- if the RawArtifact was finalized before a response or terminal execution update was lost, replay discovers that immutable artifact and returns it instead of creating another one;
- an already-started execution with no finalized RawArtifact is treated as incomplete/uncertain and fails closed rather than guessing, deleting evidence or silently creating a second Run;
- no background retry is introduced.

A terminal or uncertain failed intent may be retried only as a new explicit upload intent with a new idempotency key. Broader orphaned-execution reconciliation belongs to the shared Worker execution recovery boundary rather than to Manual Upload.

## Conversion handoff

After RawArtifact finalization and execution completion, Manual Upload calls the existing automatic conversion dispatcher. Conversion eligibility, exact converter version, leases, staging verification and provider behavior remain owned by the existing conversion subsystem.

A conversion-dispatch failure does not roll back or delete an already-finalized RawArtifact. The upload result reports the conversion-dispatch failure code so the artifact remains inspectable and recoverable.

## Admin surface

The Raw Artifacts page contains the Manual Upload control. The browser:

1. reads the server policy;
2. validates file type and size;
3. calculates SHA-256 with WebCrypto;
4. sends the raw file body with the frozen metadata headers;
5. shows the resulting RawArtifact, Run and automatic-conversion status.

The UI never receives or renders a local CAS filesystem path.

## Non-goals

Manual Upload V1 does not add:

- Local Folder Worker ingestion;
- directory watching or automatic scheduling;
- background upload retry;
- archive extraction;
- malware execution or content trust classification;
- a parallel converter implementation;
- changes to K14-K16 ReadyPackage V2 delivery semantics.

## Validation coverage

The integration suite uses a real temporary SQLite registry and local CAS and covers:

- successful governed upload through Run/Job/lease/ingestion/finalization;
- finalized exact replay with one RawArtifact;
- idempotency conflict for changed content;
- unsupported media rejection;
- path, backslash, control-character and empty filename rejection;
- declared oversize rejection;
- actual streamed-byte overflow despite smaller declared metadata;
- simultaneous independent uploads remaining bound to their own Run and Job;
- Workspace validation/isolation.
