# Crawl4AI acquisition runtime

This directory contains the production acquisition sidecar used by `Crawl4AiSubprocessAcquirer`.

## Install

Use Python 3.12+ in a dedicated virtual environment:

```bash
python -m pip install -r workers/crawl4ai/requirements.txt
crawl4ai-setup
crawl4ai-doctor
```

Crawl4AI is pinned to `0.9.2` so collection evidence is tied to a known runtime version.

## Security boundary

The worker accepts one JSON request on stdin and returns one JSON manifest on stdout. Crawled bytes are written only into the caller-provided temporary output directory. The Node worker verifies file containment, size and SHA-256 before RawArtifact ingestion.

The runtime rejects non-HTTP(S) targets, URL credentials, localhost/internal hostnames, non-public DNS answers, private/link-local/reserved IP ranges, non-standard target ports, cross-host deep-crawl links and cross-domain redirects other than `www`/apex aliases.

For production, `MARKORBIT_CRAWL4AI_REQUIRE_EGRESS_PROXY` is enabled by the Node acquirer unless explicitly disabled. Configure:

```bash
export MARKORBIT_CRAWL4AI_EGRESS_PROXY=http://egress-proxy.internal:3128
```

The egress proxy or network policy must independently deny RFC1918, loopback, link-local, metadata-service and other non-public destinations. Application-level DNS checks are defense in depth, not a substitute for network-layer egress enforcement against DNS rebinding or malicious browser subresources.

For local development only, construct the Node acquirer with `requireEgressProxy: false` or set `MARKORBIT_CRAWL4AI_REQUIRE_EGRESS_PROXY=0`.

## Collection policy mapping

The immutable `CollectionPlan` snapshot controls:

- start URLs from the accepted `SourceDefinition` entrypoints
- `maxDepth` and `maxItems`
- include/exclude patterns
- JavaScript enablement
- robots.txt checking
- request timeout
- rate limit
- locale
- authorized artifact kinds

This runtime currently emits only `HTML` and `MARKDOWN`. It deliberately does not synthesize PDFs or fetch attachments yet; those require separate evidence semantics and download controls.
