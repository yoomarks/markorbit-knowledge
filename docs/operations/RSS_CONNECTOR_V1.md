# RSS Connector V1

Status: post-v0.1 connector breadth  
Connector: `rss-worker@1.0.0`  
Source type: `RSS`  
Job type: existing `WEB_CRAWL`

## Purpose

RSS Connector V1 adds governed RSS 2.0 and Atom 1.0 ingestion without changing Schema v1 or creating a parallel execution system. It reuses the existing Source → Connector → CollectionPlan → CollectionRun/Job → Worker lease → RawArtifact path.

The frozen vocabulary already contains the `RSS` Source type but no RSS-specific Job type. `rss-worker@1.0.0` therefore declares exactly one collection Job type, `WEB_CRAWL`; the existing `deriveCollectionJobType` logic resolves RSS jobs unambiguously without introducing `RSS_COLLECTION` or a schema migration.

## Artifact model

Each successful feed acquisition produces:

1. the exact feed response bytes as one immutable `XML` RawArtifact; and
2. one deterministic `JSON` entry envelope for every RSS item / Atom entry.

The feed receives a stable canonical identity:

```text
rss://<sha256(normalized-feed-url)>/feed
```

Each entry receives a stable canonical identity:

```text
rss://<feed-digest>/entry/<sha256(stable-entry-id)>
```

Stable entry identity is selected in this order:

1. RSS `guid` or Atom `id`;
2. normalized entry link;
3. a deterministic hash of bounded title/date/summary/content fields when no explicit ID or link exists.

Duplicate stable identities within one feed fail the Job instead of creating two ambiguous versions. An entry with no deterministic identity material also fails closed.

## Versioning and incremental behavior

RSS V1 does **not** introduce an RSS cursor database, seen-ID table, or second deduplication ledger.

Existing RawArtifact semantics are authoritative:

- the same `canonicalUri` is the logical document identity;
- unchanged bytes reuse the existing content-addressed object;
- changed bytes under the same canonical identity produce the next RawArtifact version and `supersedesArtifactId` chain;
- entry artifacts are sorted by canonical identity before upload, keeping artifact-session ordering deterministic even when a publisher reorders the feed.

This means a publisher editing an existing item creates a new version of that item rather than a different logical article.

## Network security boundary

RSS V1 uses the same public-network policy as the governed API connector:

- HTTPS only;
- default HTTPS port only;
- GET only;
- no redirects;
- no URL userinfo or fragments;
- credential-like query parameters are rejected;
- all DNS answers must be public;
- loopback, private, link-local, multicast, reserved and documentation ranges are rejected;
- the HTTPS socket connects to an already validated resolved IP while preserving the original TLS SNI and HTTP `Host`, preventing DNS rebinding between validation and connection;
- bounded timeout and streamed response size.

RSS V1 has no authenticated-feed support. Do not place credentials in the feed URL. Authenticated/private feeds require a future explicit credential-binding design rather than weakening this policy.

## XML and feed parser boundary

Supported feed roots:

- RSS 2.0 `<rss>`;
- Atom 1.0 `<feed>`.

RSS 1.0/RDF is explicitly outside V1.

Parser controls include:

- valid UTF-8 input only;
- DTD and entity declarations rejected;
- unsupported XML declarations rejected;
- only predefined XML entities and valid numeric character references accepted;
- bounded XML nesting depth, node count, and attributes per node;
- bounded title, identity, link, author, category, summary and content fields;
- bounded per-entry envelope size and total generated entry bytes;
- source-order preservation for mixed text/child-element content.

The raw feed bytes are always retained separately from normalized entry envelopes, so extraction never replaces the original evidence.

## Bounds

Defaults:

- request timeout: 30 seconds;
- feed response: 5 MiB;
- entries per feed: 100.

Hard V1 limits:

- request timeout: 120 seconds;
- feed response: 20 MiB;
- entries per feed: 500;
- XML depth: 64;
- XML nodes: 25,000;
- generated entry envelope: 512 KiB each;
- generated entry envelopes: 50 MiB aggregate.

If a feed exceeds a configured or hard entry limit, acquisition fails. It is never silently truncated.

## Bootstrap

Configure one public HTTPS feed and create the Connector, Source, manual CollectionPlan and Worker definition:

```bash
export MARKORBIT_CONTROL_PLANE_URL=http://localhost:3000
export MARKORBIT_RSS_FEED_URL=https://example.com/feed.xml
export MARKORBIT_RSS_SOURCE_NAME='Example Updates'
export MARKORBIT_RSS_TIMEOUT_MS=30000
export MARKORBIT_RSS_MAX_RESPONSE_BYTES=5242880
export MARKORBIT_RSS_MAX_ENTRIES=100

pnpm --filter @markorbit/worker bootstrap:rss
```

Add `-- --dispatch` to create one manual CollectionRun:

```bash
pnpm --filter @markorbit/worker bootstrap:rss -- --dispatch
```

A newly created Worker credential is printed once. Store it securely, then start the RSS Worker:

```bash
export MARKORBIT_COLLECTION_PROVIDER=rss
export MARKORBIT_WORKER_ID=wrk_...
export MARKORBIT_WORKER_CREDENTIAL=...
export MARKORBIT_CONTROL_PLANE_URL=http://localhost:3000

pnpm --filter @markorbit/worker start
```

The feed URL is durable Source configuration because it is a public source locator, not a secret. Worker credentials remain Worker-runtime secrets.

## Scheduling and change watch

RSS Sources use the existing durable CollectionPlan scheduler. `MANUAL`, `INTERVAL`, `CRON`, and `CHANGE_WATCH` remain control-plane concerns.

For RSS, both ordinary collection and change-watch scheduling resolve to the connector's unique existing `WEB_CRAWL` Job type. The connector advertises `CHECK_UPDATE`, satisfying the scheduler's change-watch capability gate, but the Worker does not create a second HEAD/check-only network path. It performs the same bounded acquisition and lets immutable RawArtifact identity/content versioning determine what changed.

There is no RSS timer daemon or provider-specific scheduler state.

## Retry semantics

The connector only reports retryability to the existing execution ledger. CollectionPlan retry policy remains authoritative; RSS V1 does not add automatic or background retry.

Generally retryable:

- DNS/transport/TLS transient failure;
- timeout;
- HTTP 408, 425, 429;
- HTTP 5xx.

Non-retryable:

- invalid Source configuration;
- private/non-public network target;
- redirect;
- other HTTP 4xx;
- unsupported MIME or feed format;
- malformed/unsafe XML;
- response/entry/parser bounds exceeded;
- ambiguous or missing entry identity.

## V1 non-goals

- RSS 1.0/RDF;
- authenticated/private feeds;
- redirect following;
- WebSub / push subscriptions;
- conditional HTTP cursor persistence (`ETag` / `Last-Modified`);
- automatic pagination;
- following entry links to acquire article pages;
- downloading enclosures or media;
- HTML sanitization/rendering inside entry content;
- provider-specific retry/background polling;
- schema changes or a provider-specific persistence database.
