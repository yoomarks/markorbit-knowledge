# API Connector V1

Status: post-v0.1 connector breadth  
Connector: `api-worker@1.0.0`  
Source type: `API`  
Job type: `API_COLLECTION`

## Purpose

API Connector V1 adds one production, read-only HTTPS acquisition primitive without changing the frozen Knowledge control plane. It reuses the existing Source → Connector → CollectionPlan → CollectionRun/Job → Worker lease → RawArtifact ingestion path.

V1 intentionally collects one response per Job. Pagination, POST bodies, redirects, OAuth refresh flows and browser-driven authentication are not part of this version.

## Security boundary

The durable Source stores only a logical endpoint binding plus a relative request path and non-secret query values. The real network origin and credentials stay local to the Worker in `MARKORBIT_API_ENDPOINT_BINDINGS` and referenced secret environment variables.

The Worker enforces:

- HTTPS only;
- GET only;
- no redirects;
- no URL userinfo, fragment, origin path prefix, or source-controlled host;
- DNS resolution before acquisition;
- rejection of loopback, private, link-local, multicast, reserved and documentation address ranges;
- failure when any DNS answer is non-public;
- connection to the already validated IP while preserving TLS SNI and the HTTP `Host` header, preventing a second DNS lookup from changing the destination;
- bounded timeout and streaming response size;
- structured-text MIME allowlisting;
- credential-like query keys are rejected;
- authentication values are read only from Worker environment variables.

The RawArtifact `sourceUri` is a logical value such as:

```text
api://public-api/8df2...<sha256>
```

It does not contain the endpoint hostname, resource path, query string, credential value, or credential environment-variable name.

## Worker endpoint bindings

Define bindings on the Worker only:

```bash
MARKORBIT_API_ENDPOINT_BINDINGS='{
  "public-api": {
    "baseUrl": "https://api.example.com",
    "auth": { "kind": "BEARER", "secretEnv": "EXAMPLE_API_TOKEN" }
  }
}'
EXAMPLE_API_TOKEN='...'
```

Supported auth forms:

```json
{ "kind": "NONE" }
```

```json
{ "kind": "BEARER", "secretEnv": "EXAMPLE_API_TOKEN" }
```

```json
{ "kind": "HEADER", "headerName": "x-api-key", "secretEnv": "EXAMPLE_API_KEY" }
```

`baseUrl` must be a pure HTTPS origin. Put the request path in Source configuration instead of the binding.

## Bootstrap

Example:

```bash
export MARKORBIT_CONTROL_PLANE_URL=http://localhost:3000
export MARKORBIT_API_ENDPOINT_BINDINGS='{"public-api":{"baseUrl":"https://api.example.com","auth":{"kind":"BEARER","secretEnv":"EXAMPLE_API_TOKEN"}}}'
export EXAMPLE_API_TOKEN='...'
export MARKORBIT_API_ENDPOINT_BINDING=public-api
export MARKORBIT_API_RESOURCE_PATH=/v1/items
export MARKORBIT_API_QUERY_JSON='{"page":"1"}'
export MARKORBIT_API_SOURCE_NAME='Example API'

pnpm --filter @markorbit/worker bootstrap:api
```

Add `-- --dispatch` to create one manual CollectionRun after bootstrap:

```bash
pnpm --filter @markorbit/worker bootstrap:api -- --dispatch
```

The bootstrap output may return a newly issued Worker credential. Store it securely and start the Worker with:

```bash
export MARKORBIT_COLLECTION_PROVIDER=api
export MARKORBIT_WORKER_ID=wrk_...
export MARKORBIT_WORKER_CREDENTIAL=...
export MARKORBIT_CONTROL_PLANE_URL=http://localhost:3000
export MARKORBIT_API_ENDPOINT_BINDINGS='...'

pnpm --filter @markorbit/worker start
```

Do not copy endpoint credentials into Source `connectorConfig`, CollectionPlan extensions, shell history committed to the repository, or operator notes stored in Knowledge.

## Source connectorConfig

The durable configuration is intentionally locator-minimal:

```json
{
  "endpointBinding": "public-api",
  "resourcePath": "/v1/items",
  "query": {
    "page": "1"
  },
  "timeoutMs": 30000,
  "maxResponseBytes": 10485760,
  "acceptedMimeTypes": ["application/json"]
}
```

`acceptedMimeTypes` is optional. V1 supports these structured-text families:

- `application/json` and `application/*+json` → `JSON`;
- `application/xml`, `text/xml`, and `application/*+xml` → `XML`;
- `text/csv`, `application/csv` → `CSV`;
- `text/plain` → `TEXT`;
- `text/markdown` → `MARKDOWN`.

The default response limit is 10 MiB and the default timeout is 30 seconds. The implementation also enforces hard Worker-side maximums even if a Source is created outside the bootstrap path.

## Retry semantics

The connector reports retryability to the existing execution ledger; it does not create a second retry loop.

Generally retryable:

- DNS/transport/TLS transient failures;
- timeout;
- HTTP 408, 425, 429;
- HTTP 5xx.

Non-retryable:

- invalid Source or binding configuration;
- private/non-public network targets;
- redirects;
- other HTTP 4xx;
- unsupported MIME;
- response size violations;
- missing Worker credential binding.

Existing CollectionPlan retry policy remains authoritative.

## Scheduler and change-watch

API Sources use the existing durable scheduler. `MANUAL`, `INTERVAL`, `CRON`, and `CHANGE_WATCH` remain control-plane concerns; API Connector V1 does not introduce a timer or background daemon.

Repeated responses flow through the same RawArtifact/content-versioning path as other Sources. No API-specific persistence database is introduced.

## Non-goals for V1

- POST/PUT/PATCH/DELETE;
- request bodies;
- automatic pagination;
- redirect following;
- OAuth refresh-token management;
- cookie/browser sessions;
- arbitrary custom headers stored in Source configuration;
- proxy configuration from Source data;
- automatic delivery retry or ReadyPackage V2 behavior changes.
