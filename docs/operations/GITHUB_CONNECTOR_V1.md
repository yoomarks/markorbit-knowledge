# GitHub Connector V1

GitHub Connector V1 is the governed production repository-snapshot provider for Schema v1 `GITHUB` Sources.

It reuses the existing Knowledge execution path:

`SourceDefinition → ConnectorManifest → CollectionPlan → CollectionRun/Job → Worker lease → RawArtifact`.

It does not add a GitHub-specific queue, cursor table, scheduler, retry daemon, schema version, or JobType. The connector uses the existing `WEB_CRAWL` JobType because Schema v1 already contains `GITHUB` as a SourceType but has no GitHub-specific collection JobType.

## Scope

V1 collects one GitHub repository ref and an optional path prefix. Each authorized run:

1. resolves `api.github.com` and requires every DNS result to be public;
2. pins HTTPS transport to one validated address while preserving TLS SNI and Host;
3. resolves the configured ref through the GitHub commit API;
4. freezes that run to the returned immutable commit SHA and tree SHA;
5. fetches the recursive tree for that exact tree SHA;
6. rejects a truncated tree instead of silently using partial evidence;
7. selects files using the CollectionPlan path patterns, depth, item and output-kind policy;
8. rejects matched symlinks and submodules;
9. fetches each selected Git blob by immutable blob SHA;
10. verifies tree size and Git object hash before ingestion;
11. requires selected file bytes to be non-empty UTF-8 text;
12. emits two exact JSON evidence artifacts plus the selected repository files.

## Identity and versioning

No GitHub cursor or seen-SHA database is introduced.

Repository snapshot evidence uses stable canonical URIs:

- `github://owner/repository/snapshot`
- `github://owner/repository/tree`

Files use a canonical URI based on repository path:

- `github://owner/repository/file/<path>`

The immutable source URI includes the exact commit SHA:

- `github://owner/repository/blob/<commit-sha>/<path>`

Therefore branch movement does not create a new logical file identity. Existing RawArtifact canonical-URI versioning records a new version only when the captured evidence changes.

## Supported file classes

V1 is intentionally text-only. It supports bounded UTF-8 files classified as:

- `MARKDOWN`: `.md`, `.markdown`;
- `HTML`: `.html`, `.htm`;
- `JSON`: `.json`;
- `XML`: `.xml`, `.rss`, `.atom`;
- `CSV`: `.csv`;
- `TEXT`: common source-code, configuration, shell, SQL, GraphQL, protobuf, Terraform/HCL and plain-text extensions plus common text filenames such as `Dockerfile`, `Makefile`, `LICENSE`, `NOTICE` and `CHANGELOG`.

Images, archives, compiled objects, arbitrary binary blobs and other non-UTF8 content are outside V1.

Empty supported files are represented by tree evidence but are not emitted as RawArtifact file bodies because artifact ingestion forbids empty content.

## Authentication

Public repositories can be collected without a token, subject to GitHub rate limits.

For private repositories or higher authenticated rate limits, inject:

```bash
MARKORBIT_GITHUB_TOKEN=<runtime secret>
```

The token is read only by the Worker process. It is never stored in SourceDefinition, ConnectorManifest, CollectionPlan, RawArtifact, browser responses, provenance URIs or logs.

The Source persists only:

- owner;
- repository;
- ref;
- optional path prefix.

GitHub Enterprise Server is outside V1. The network authority is fixed to `api.github.com`.

## Worker limits

Default Worker hard limits are:

- 2 MiB per selected file;
- 50 MiB aggregate snapshot bytes, including commit/tree JSON evidence;
- 20,000 recursive tree entries;
- 500 selected files;
- depth 30.

They can be reduced or raised within hard V1 ceilings using the Worker environment variables documented in `.env.example`.

The immutable CollectionPlan must remain within the Worker's item/depth ceilings. A plan exceeding Worker limits fails before network collection.

The plan's `maxItems` applies to selected repository files. The connector additionally emits exactly two required JSON evidence artifacts for the commit and tree responses.

## Bootstrap

Set at least:

```bash
MARKORBIT_GITHUB_OWNER=openai
MARKORBIT_GITHUB_REPOSITORY=example
MARKORBIT_GITHUB_REF=main
```

Optional source scope:

```bash
MARKORBIT_GITHUB_PATH_PREFIX=docs
MARKORBIT_GITHUB_INCLUDE_PATTERNS_JSON='["**/*.md","*.md"]'
MARKORBIT_GITHUB_EXCLUDE_PATTERNS_JSON='["private/**"]'
MARKORBIT_GITHUB_PLAN_MAX_ITEMS=250
MARKORBIT_GITHUB_PLAN_MAX_DEPTH=20
```

Bootstrap the ConnectorManifest, SourceDefinition, CollectionPlan and Worker registration:

```bash
pnpm --filter @markorbit/worker bootstrap:github
```

Add `-- --dispatch` to create the first authorized run.

The Worker process then uses:

```bash
MARKORBIT_COLLECTION_PROVIDER=github
```

and, when needed, `MARKORBIT_GITHUB_TOKEN`.

## Scheduling and change-watch

Scheduling remains a CollectionPlan concern. `MANUAL`, `INTERVAL`, `CRON` and `CHANGE_WATCH` use the existing scheduler and execution ledger.

`github-worker@1.0.0` declares `COLLECT` and `CHECK_UPDATE`, and exactly one collection JobType: `WEB_CRAWL`. No second scheduler or GitHub webhook/WebSub path is introduced.

## Fail-closed boundaries

V1 fails rather than silently degrading when:

- DNS produces any private/non-public address;
- GitHub redirects a request;
- the recursive tree is truncated;
- tree metadata is malformed or contains duplicate/unsafe paths;
- a matched path is a symlink or submodule;
- a matched file exceeds Worker limits;
- blob size differs from tree evidence;
- Git object hash verification fails;
- a matched file is binary/non-UTF8;
- the aggregate snapshot exceeds the Worker limit;
- selected files exceed CollectionPlan `maxItems`;
- the plan requires more item/depth capacity than the Worker permits;
- JSON evidence is not authorized by the CollectionPlan.

Rate-limit responses are retry-classified as transient evidence, but the connector does not create automatic/background retries. Existing execution/retry controls remain authoritative.

## V1 non-goals

- GitHub Enterprise Server;
- Git clone or arbitrary git command execution;
- submodule traversal;
- symlink dereferencing;
- binary/media ingestion;
- LFS object fetching;
- Releases/Packages/Actions artifacts;
- Issues, Discussions, Pull Requests or comments as knowledge objects;
- repository write operations;
- webhook delivery;
- provider-specific cursor persistence;
- provider-specific background retry;
- pagination around a truncated recursive tree.

A future connector version may add these capabilities only through the existing governed contracts or an explicitly versioned architecture change.
