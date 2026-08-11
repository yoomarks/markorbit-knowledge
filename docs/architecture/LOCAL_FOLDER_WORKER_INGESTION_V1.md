# Local Folder Worker Ingestion V1

## Purpose

Local Folder Worker ingestion is the governed production path for files that already exist on a machine or mounted filesystem visible to a MarkOrbit Worker.

It is a horizontal acquisition extension. It does not create a second artifact store, a second execution ledger, or a shortcut into Staging or Vault.

```text
Worker-local allowed root alias
  -> LOCAL_FOLDER SourceDefinition
  -> MANUAL CollectionPlan
  -> CollectionRun / LOCAL_FILE_SCAN Job
  -> authenticated Worker claim + JobLease
  -> LocalFolderArtifactAcquirer
  -> Artifact Ingestion Protocol v1
  -> local content-addressed storage
  -> immutable RawArtifact
  -> existing conversion pipeline
```

## Absolute-path boundary

Absolute filesystem roots are deployment secrets/configuration and remain local to the Worker process.

The Worker receives an explicit JSON map such as:

```text
MARKORBIT_LOCAL_FOLDER_ROOTS={"legal":"/srv/markorbit/legal","research":"/srv/markorbit/research"}
```

A `LOCAL_FOLDER` SourceDefinition stores only:

- `rootId`, for example `legal`;
- a portable forward-slash `relativePath` below that root;
- `recursive`;
- `includeHidden`.

The Source, Run, Job, RawArtifact provenance and logs do not need the absolute Worker path. Logical evidence uses `local-folder://<rootId>/<relative-path>` URIs.

Changing the deployment path behind an existing root alias does not rewrite SourceDefinition identity. Operators are responsible for ensuring that the alias still refers to the intended authority/source boundary.

## Production connector

The frozen production identity is:

- connector: `local-folder-<rootId>@1.0.0`, for example `local-folder-legal@1.0.0`;
- source type: `LOCAL_FOLDER`;
- job type: `LOCAL_FILE_SCAN`;
- runtime: `LOCAL_AGENT`;
- capabilities: `COLLECT`, `IMPORT`.

The bootstrap command is:

```bash
pnpm --filter @markorbit/worker bootstrap:local-folder
```

Adding `-- --dispatch` creates one normal manual Run after connector, source, plan and Worker registration are present.

The generic Worker executable selects this provider with:

```text
MARKORBIT_COLLECTION_PROVIDER=local-folder
```

The existing Crawl4AI provider remains the default and is unchanged.

The root alias is part of connector identity so Worker compatibility is decided before Job claim. A Worker configured for `legal` binds `local-folder-legal`; it cannot claim a `local-folder-research` Job unless `research` is also in its local allowlist and Worker connector bindings. Absolute paths remain Worker-local and are not encoded in connector identity.

## Root and traversal policy

The Local Folder Worker fails closed unless all path evidence remains inside one configured root.

Controls are applied before file bytes are accepted:

- root IDs must be explicit lowercase slugs in the Worker allowlist;
- root values must be absolute paths;
- Source relative paths must be portable relative paths;
- absolute paths, Windows drive prefixes, backslashes, empty path segments, `.` and `..` segments are rejected;
- configured roots must resolve to directories;
- each Source path segment is inspected with `lstat`;
- symbolic links in the Source path are rejected;
- symbolic links encountered during directory traversal are rejected;
- every resolved directory/file is rechecked to remain below the canonical allowed root.

Symlink traversal is deliberately not followed even when the symlink target would remain within the root. This keeps the V1 authorization boundary simple and auditable.

## Collection policy

The immutable CollectionPlan continues to own acquisition intent:

- `includePatterns` and `excludePatterns` filter portable relative paths;
- `maxDepth` bounds recursive traversal;
- `maxItems` bounds eligible files;
- output `artifactKinds` bounds accepted file families;
- retry remains an execution policy rather than a filesystem watch.

The Worker also has independent hard limits for maximum depth, item count, per-file bytes and total bytes. A CollectionPlan may be stricter, but may not authorize work outside those Worker limits.

V1 recognizes Markdown, HTML, PDF, DOCX, XLSX, CSV, JSON, XML, RFC 822 email, plain text, PNG, JPEG, WebP and TIFF. Unsupported extensions are ignored rather than reclassified as trusted content.

If eligible files exceed `maxItems`, the run fails rather than silently truncating the snapshot.

## Stable file snapshot

A file is accepted only from a stable regular-file snapshot.

For each candidate the Worker:

1. rejects symlinks and non-regular entries;
2. checks the pre-read byte size against the Worker limit;
3. resolves the file and proves it remains below the configured root;
4. opens the resolved file;
5. captures opened-file size and modification time;
6. reads the bounded bytes;
7. rechecks opened-file size/mtime, logical-path symlink state and resolved identity;
8. fails with retryable `LOCAL_FOLDER_FILE_CHANGED` if the file changed during the read.

The content SHA-256 is then computed from the accepted bytes.

A separate snapshot digest freezes:

```text
relative path + size + mtime + content SHA-256
```

The snapshot digest is acquisition evidence only. The Artifact Ingestion Protocol independently recomputes and verifies the actual content byte count and SHA-256 before RawArtifact finalization.

## Logical identity and version evidence

For a given Source path, the Worker emits a stable canonical URI:

```text
local-folder://legal/contracts/example.pdf
```

The per-run source URI adds the observed content SHA-256, snapshot digest and size without exposing the absolute local path.

This is intentionally aligned with the existing RawArtifact registry:

- same Workspace + Source + canonical URI identifies the same logical local file across scans;
- a later accepted scan can become the next immutable RawArtifact version and retain `supersedesArtifactId` through the existing registry behavior;
- identical content continues to use the existing content-addressed object deduplication boundary;
- different bytes receive a different content digest while preserving logical canonical identity.

Local Folder Worker V1 does not mutate or delete prior RawArtifact versions.

## Worker lease and restart semantics

Local Folder collection uses the same `ControlledCollectionWorkerRuntime` as production web acquisition.

Therefore:

- a Job must be claimed by an authenticated compatible Worker;
- acquisition runs under an active JobLease and lease token;
- long reads retain the existing heartbeat and lease-renewal keepalive;
- bytes cannot complete execution until Artifact Ingestion receipts exist;
- if the Worker disappears after execution starts, the existing lease-expiry and execution reconciliation boundary remains authoritative;
- V1 does not create an invisible background filesystem retry or duplicate Run;
- a new collection attempt is represented by normal governed scheduling/manual dispatch semantics.

A Worker restart does not reconstruct work from local ad-hoc files or private process memory. Durable Run, Job, lease, execution, session and RawArtifact evidence remain in the control plane/CAS.

## Relationship to legacy LocalFileConnector

`LocalFileConnector` predates this production boundary and remains only as a compatibility helper for callers that already use its lightweight direct-file API.

It is not the production `LOCAL_FOLDER` provider, is not used by `bootstrap:local-folder`, and is not selected by `MARKORBIT_COLLECTION_PROVIDER=local-folder`.

New production filesystem acquisition must use `LocalFolderArtifactAcquirer` and the governed Worker path described here.

## Security and trust

Filesystem location is provenance, not authority verification.

A Local Folder Source created by the bootstrap defaults to:

- category `USER_PROVIDED`;
- authority level `UNKNOWN`.

Reading a file successfully does not make its legal or factual content verified. Downstream conversion and semantic/legal-truth boundaries remain unchanged.

## Non-goals

Local Folder Worker V1 does not add:

- automatic directory watching or change scheduling;
- automatic background retry;
- filesystem write-back;
- deletion propagation;
- archive extraction;
- symlink following;
- network-share credential management;
- malware execution or content trust classification;
- a parallel converter implementation;
- changes to ReadyPackage V1/V2 or Core delivery semantics.
