# Crawl4AI Production Worker and USPTO Golden Source

This runbook turns the governed collection contracts into a separately deployable acquisition Worker. The control plane remains authoritative for Source, CollectionPlan, Job, lease, RawArtifact ingestion and execution evidence; the Worker only claims authorized work and produces bounded bytes.

## Production path

```text
Accepted SourceDefinition
  → ACTIVE CollectionPlan
  → manual/authorized CollectionRun + Job
  → compatible Worker claim + JobLease
  → Crawl4AI 0.9.2 acquisition
  → HTML / Markdown byte verification
  → RawArtifact ingestion + SHA-256 evidence
  → VERIFYING
  → COMPLETED execution receipt
```

The first reference source is the USPTO trademark website. It is classified as `OFFICIAL_AUTHORITY` / `PRIMARY_OFFICIAL`; that authority metadata describes provenance and does not itself certify that every captured page is current legal truth.

## 1. Start the control plane

From the repository root:

```bash
corepack enable
corepack prepare pnpm@11.13.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

The default control plane is `http://localhost:3000`.

## 2. Bootstrap the first Golden Source

```bash
pnpm --filter @markorbit/worker bootstrap:uspto
```

The bootstrap is idempotent. It ensures:

- `crawl4ai-web@1.1.0`, a production manifest that advertises only the implemented `WEB_CRAWL` path with `COLLECT`, `DEEP_CRAWL` and `RENDER_JAVASCRIPT` capabilities and HTML/Markdown output; discovery, preview and update-check capabilities are deliberately not declared yet;
- `USPTO Trademarks — Golden Source` with `https://www.uspto.gov/trademarks` as its accepted official entrypoint;
- a bounded manual CollectionPlan: depth 1, at most 8 pages, robots enabled, 12 requests/minute, HTML + Markdown only;
- one compatible production Worker registration.

When the Worker is created, the command prints its credential **once**. Store it in a secret manager and do not commit it. Existing Worker credentials are intentionally not recoverable; rotate the credential in the control plane when necessary.

To bootstrap and create the first PENDING run in one command:

```bash
pnpm --filter @markorbit/worker bootstrap:uspto -- --dispatch
```

Bootstrap does not execute the crawl itself. Execution begins only when the registered Worker starts and successfully claims the authorized Job.

## 3. Local validation Worker

Install Crawl4AI in an isolated Python 3.12+ environment first:

```bash
python -m pip install -r workers/crawl4ai/requirements.txt
crawl4ai-setup
crawl4ai-doctor
```

Then export the values returned by bootstrap. Keep the repository/script paths explicit because pnpm filter commands execute the Worker from its workspace directory:

```bash
export MARKORBIT_CONTROL_PLANE_URL=http://localhost:3000
export MARKORBIT_WORKER_ID=wrk_...
export MARKORBIT_WORKER_CREDENTIAL=mwk_...
export MARKORBIT_REPOSITORY_ROOT="$(pwd)"
export MARKORBIT_CRAWL4AI_SCRIPT="$MARKORBIT_REPOSITORY_ROOT/workers/crawl4ai/acquire.py"
```

Direct egress is a local-development exception only:

```bash
MARKORBIT_CRAWL4AI_REQUIRE_EGRESS_PROXY=0 pnpm --filter @markorbit/worker start
```

## 4. Production Docker Worker

Production refuses to disable the egress-proxy requirement. Build the image:

```bash
docker build -f deploy/crawl4ai-worker/Dockerfile -t markorbit/crawl4ai-worker:0.1.0 .
```

Required runtime secrets/configuration:

```text
MARKORBIT_CONTROL_PLANE_URL
MARKORBIT_WORKER_ID
MARKORBIT_WORKER_CREDENTIAL
MARKORBIT_CRAWL4AI_EGRESS_PROXY
```

Use `deploy/crawl4ai-worker/compose.example.yml` as the deployment baseline. The egress proxy or equivalent network policy must independently reject loopback, RFC1918/private networks, link-local ranges, cloud metadata endpoints and other non-public destinations. Application DNS/URL checks are defense in depth and cannot by themselves defeat DNS rebinding or malicious browser subresources.

The container runs as a non-root user, drops Linux capabilities and uses a read-only root filesystem. Runtime `HOME`, XDG cache and temporary paths are redirected into the bounded writable `/tmp` tmpfs so browser/acquisition scratch state does not require writes to the image filesystem.

## Lease keepalive

A production crawl can exceed the default JobLease duration. `ControlledCollectionWorkerRuntime` therefore renews the active lease and reports an active heartbeat while acquisition is in progress. The default keepalive interval is 30 seconds. A keepalive transport failure is logged by the Worker; it does not grant the Worker authority to rewrite lease or Job state. The control plane still decides expiry and reconciliation.

The Worker also caps a single acquisition below the default maximum lease lifetime: 12 minutes by default and 14 minutes maximum. This prevents application execution from intentionally outliving the control plane's default 15-minute maximum lease window.

## Live Golden Source smoke

The repository contains the manually triggered GitHub Actions workflow `USPTO Golden Source Live Smoke`. It intentionally does **not** run on ordinary pushes or pull requests because it depends on a live external authority and must not turn transient USPTO/network conditions into normal CI failures.

The workflow creates isolated SQLite/artifact storage, starts the real control plane, bootstraps an authorized USPTO run, starts the real Worker Protocol with a CI-only direct-egress exception, performs a live Crawl4AI acquisition and then runs:

```bash
pnpm --filter @markorbit/worker verify:uspto -- run_...
```

The verifier requires all of the following before the smoke passes:

1. CollectionRun and its Job reach `COMPLETED`;
2. the execution attempt is `COMPLETED` and contains `STARTED → UPLOADING → VERIFYING → COMPLETED` evidence;
3. RawArtifacts include both `HTML` and `MARKDOWN`;
4. every RawArtifact is `REGISTERED`, has an HTTPS `*.uspto.gov` provenance URI and valid SHA-256 binary identity;
5. persisted content-object SHA-256 and byte size exactly match the RawArtifact;
6. the collector is `crawl4ai-web@1.1.0`;
7. the terminal execution receipt references every finalized artifact receipt.

The reference live proof on 2026-08-08 completed the bounded 8-page USPTO crawl and verified **16 RawArtifacts**: 8 HTML and 8 Markdown artifacts. This proves the real acquisition/evidence chain, not merely fixture behavior.

## What to verify after any production run

A successful Golden Source run must leave durable evidence in the control plane:

1. the run is `COMPLETED`;
2. its Job has a completed execution attempt and lifecycle events;
3. RawArtifacts exist for the authorized HTML/Markdown outputs;
4. each artifact has immutable source URI, size and SHA-256 provenance;
5. the terminal execution receipt references the finalized artifact receipt IDs;
6. no Worker credential, proxy credential or arbitrary application secret appears in artifacts or logs.

Do not treat a successful crawl as proof of legal correctness. It proves controlled acquisition and provenance. Conversion, semantic extraction, claim resolution and professional/legal judgment remain later stages.

## Deliberate boundary

This Worker still does **not** download arbitrary attachments or synthesize PDFs. PDF/attachment acquisition needs a separate downloader with MIME validation, redirect controls, byte limits, relationship/provenance semantics and tests before it can enter the evidence chain.
