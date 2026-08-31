# CNIPA ordinary-Chrome offline HAR evidence import

Status: operator-only offline evidence path for Phase 3 of #573.

Use this path only when the authorized CNIPA portal is usable in the operator's ordinary Chrome session but the Playwright-launched browser is blocked by the site's access-control layer. This workflow does not automate login, attach automation to the logged-in browser, copy cookies/tokens, or replay authenticated requests.

## Safety boundary

The raw HAR is a local sensitive runtime artifact. It may contain request headers, cookies, request values, local timing details, and other browser-session material.

- Store the raw HAR outside the repository working tree.
- Do not commit, upload, paste, or attach the raw HAR to GitHub issues/PRs.
- Do not share the raw HAR unless it has been independently reviewed for secrets.
- The importer performs no network requests.
- The importer ignores request/response headers and cookie collections completely.
- The sanitized manifest records request field **names only**, never query/body values.
- Response bodies for the six frozen CNIPA judgment endpoints are preserved as external evidence files because Phase 3 needs the actual response schema and list/detail identity evidence.

## 1. Capture one bounded operation in ordinary Chrome

1. Open the current authorized CNIPA public portal in ordinary Chrome and complete login/security verification manually.
2. Open Chrome DevTools -> Network.
3. Enable `Preserve log`, then clear the existing request list.
4. Perform only the specific authorized search/detail operation needed for the current Phase 3 probe.
5. In the Network panel, export `Save all as HAR with content`.
6. Save the HAR to an absolute path outside the repository, for example `D:\markorbit-private\cnipa\capture.har`.

Keep each capture small. Prefer one registration-number search, one detail navigation, or one pagination/party-name experiment per HAR so the resulting evidence remains reviewable.

## 2. Import and sanitize offline

Run:

```text
pnpm --filter @markorbit/worker cnipa:evidence:import-har -- \
  --input "D:\markorbit-private\cnipa\capture.har" \
  --output "D:\markorbit-private\cnipa\evidence\capture-001"
```

Both paths must be absolute and outside the repository working tree.

The command reads the HAR locally and filters only the already-observed CNIPA judgment transport surface on `pub.sbj.cnipa.gov.cn`:

- registration examination list/detail;
- opposition decision list/detail;
- review adjudication list/detail.

All six endpoints must use the currently observed `POST` transport. Detail requests must expose only the observed `id` query-key name. Any transport drift or credential-like request-body/query field causes the import to fail closed.

## 3. Sanitized output

The output directory contains:

- `manifest.json`;
- one response evidence file for each matched HAR entry whose response body was included in the HAR.

The manifest records only:

- document kind and LIST/DETAIL surface;
- method and frozen path;
- query field names;
- JSON request-body field names and whether the body parsed as JSON;
- HTTP status and response content type;
- response evidence file name, byte count and SHA-256;
- whether a JSON response parsed successfully;
- SHA-256 of the source HAR, without copying the HAR contents.

It does not persist request headers, cookies, Authorization values, token values, query values, registration numbers from the request, party-name request values, or local browser-profile information.

The response evidence files are intentionally not rewritten or normalized. Review them locally to establish the response envelope/schema, source-record identifier, list-to-detail identity, party-role semantics and pagination behavior. Keep these evidence files outside Git unless a separately reviewed fixture is deliberately derived from them with all real case data removed.

## 4. Phase 3 review sequence

Use bounded captures to establish, in order:

1. one real registration-number list query across all three judgment libraries;
2. the actual list envelope and source-record id field;
3. one list id -> detail response identity match per relevant library;
4. one party-name request after its exact request field names are observed, including opposition party roles;
5. page 11 / >100 behavior;
6. date-window behavior if the source exposes a date query;
7. authenticated 403 semantics when naturally observed.

Do not promote `OPERATOR_SUPPLIED_UNVERIFIED`, source identity, role mappings, or completeness until the corresponding sanitized evidence has been reviewed.
