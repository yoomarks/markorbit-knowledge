# CNIPA authenticated trademark judgment acquisition

Status: Phase 2 runtime implementation. Ordinary CI performs no CNIPA request and launches no real browser. Phase 3 authenticated live validation is still required before any endpoint/response mapping is promoted to verified.

Issue: #573

## Architecture

```text
Source / CollectionPlan / Run
        |
        v
Controlled Collection Worker
        |
        v
CnipaJudgmentArtifactAcquirer
        |
        v
Playwright persistent authenticated-session executor
        |
        +--> exact sanitized list JSON
        +--> exact sanitized detail JSON
        |
        v
ArtifactBackedCollectionExecutor
        |
        v
immutable RawArtifact ingestion
        |
        v
normalization / staging / Knowledge retrieval
```

CNIPA is a dedicated `MARKORBIT_COLLECTION_PROVIDER=cnipa`. It does not replace Crawl4AI, does not weaken the Crawl4AI egress-proxy requirement, and does not use Bright Data fallback.

## Authentication boundary

The browser profile is runtime-secret state and must live outside the repository/Worker working directory. Cookies, OAuth/Bearer values, browser storage values, Authorization headers and CAPTCHA material are never returned by the authenticated-session port and must not be logged or persisted as RawArtifact content.

`playwright-core` is used deliberately: the Worker requires an operator-managed Chrome/Chromium executable and does not download a browser in ordinary CI.

Required CNIPA runtime settings when the provider is selected:

- `MARKORBIT_CNIPA_BASE_URL`: HTTPS origin only.
- `MARKORBIT_CNIPA_SESSION_ENTRY_URL`: authenticated portal URL on that origin.
- `MARKORBIT_CNIPA_USER_DATA_DIR`: absolute persistent profile path outside the Worker working directory.
- `MARKORBIT_CNIPA_BROWSER_EXECUTABLE_PATH`: absolute Chrome/Chromium executable path.

Optional bounded controls:

- `MARKORBIT_CNIPA_HEADLESS` (Worker default `true`).
- `MARKORBIT_CNIPA_MIN_REQUEST_INTERVAL_MS` (default 2000, minimum 250).
- `MARKORBIT_CNIPA_MAX_REQUESTS_PER_RUN` (default 50, hard max 200).
- `MARKORBIT_CNIPA_MAX_RESPONSE_BYTES` (default 5 MiB, hard max 20 MiB).
- `MARKORBIT_CNIPA_NAVIGATION_TIMEOUT_MS` (default 60 seconds).
- `MARKORBIT_CNIPA_TREAT_FORBIDDEN_AS_REAUTH` (default `false`; do not change until live evidence supports it).

If the site requires a Bearer token that is stored in browser storage, `MARKORBIT_CNIPA_BEARER_STORAGE` contains only lookup metadata, never the token itself. Example shape:

```json
{
  "area": "localStorage",
  "key": "operator-observed-storage-key",
  "valuePath": ["accessToken"],
  "prefix": "Bearer "
}
```

The token is read and attached inside `page.evaluate()` and never crosses the sealed browser executor boundary.

## Operator login

Run:

```text
pnpm --filter @markorbit/worker cnipa:session:login
```

The command forces a headed persistent browser, opens only the configured session entry URL, and waits for the operator to complete CNIPA SSO/CAPTCHA/security verification manually. After the authenticated portal is verified, Ctrl+C closes the context so the persistent profile can be reused by the Worker.

There is no CAPTCHA solving, token forging, stealth plugin, proxy rotation, security-control bypass or autonomous login.

## Source connectorConfig

Phase 2 deliberately does not guess the CNIPA response envelope. Each Source snapshot must provide the current candidate query and a non-secret response schema mapping. For example:

```json
{
  "query": {
    "mode": "REGISTRATION_NUMBER",
    "registrationNumber": "12345678",
    "documentKinds": ["REGISTRATION_EXAMINATION"]
  },
  "responseSchema": {
    "list": {
      "recordsPath": ["data", "records"],
      "sourceRecordIdField": "id",
      "totalPath": ["data", "total"],
      "hasMorePath": ["data", "hasMore"]
    },
    "detail": {
      "rootPath": ["data"],
      "sourceRecordIdField": "id",
      "fields": {
        "registrationNumber": "regNo",
        "trademarkName": "tmName"
      },
      "parties": {
        "REGISTRATION_EXAMINATION": [{ "field": "applicantCnName", "role": "APPLICANT" }]
      }
    }
  },
  "limits": {
    "pageSize": 10,
    "maxPagesPerLibrary": 10,
    "maxDetailRequestsPerRun": 30
  }
}
```

The example envelope keys above are illustrative configuration syntax, not a claim about the live CNIPA response. Phase 3 must replace illustrative values with observed evidence before a live source is enabled.

Party-name and date-range requests still fail before browser launch because their request parameter names have not been authenticated-live-verified.

## Bounded pagination and cache

The adapter now supports multiple pages for the supplied registration-number request shape, but it only advances when decoded `hasMore=true` or a decoded `total` proves additional rows exist. It does not infer another page merely because a page is full.

Defaults are 10 rows per page, at most 10 pages per library, and at most 30 detail requests. Source snapshots may reduce or raise those values only within hard code bounds. Reaching a ceiling keeps `coverageStatus=UNKNOWN` and records an explicit coverage reason.

The Playwright executor has an additional per-run request ceiling and a minimum request interval. Identical requests inside one run are served from an in-memory response cache, so retry/re-entry inside the same deterministic acquisition does not duplicate a CNIPA request. Cache entries never contain session credentials.

No ambiguous browser/network failure is replayed automatically. It remains `CNIPA_DELIVERY_UNKNOWN`.

## Raw evidence

Every successful list and detail response is emitted as `artifactKind=JSON` using the exact sanitized response bytes. `ArtifactBackedCollectionExecutor` then performs the existing immutable RawArtifact ingestion protocol, SHA verification, change-watch identity checks and finalization. CNIPA does not write directly to persistence.

List canonical identity includes a local query digest and page number so two registration-number queries do not collide even though they POST to the same endpoint. Detail provenance retains the resolved source URL. The query digest contains no credential material.

## Candidate source mappings remain unverified

The following operator-supplied mappings are still `OPERATOR_SUPPLIED_UNVERIFIED`:

| Document kind              | Candidate list endpoint                        | Candidate detail endpoint        | Candidate party fields            |
| -------------------------- | ---------------------------------------------- | -------------------------------- | --------------------------------- |
| `REGISTRATION_EXAMINATION` | `/pubnotice/portal/tmscJudgment/queryPageList` | `/tmscJudgment/queryInfo?id=...` | `applicantCnName`                 |
| `OPPOSITION_DECISION`      | `/pubnotice/portal/tmyyJudgment/queryPageList` | `/tmyyJudgment/queryInfo?id=...` | `objenderCnName`, `objeperCnName` |
| `REVIEW_ADJUDICATION`      | `/pubnotice/portal/tmpsJudgment/queryPageList` | `/tmpsJudgment/queryInfo?id=...` | `applicantName`, `respondentName` |

The supplied registration-number list body remains the only request shape represented as a candidate:

```json
{ "pageIndex": 1, "pageSize": 10, "regNo": "..." }
```

Opposition role semantics remain `UNVERIFIED` until a live document establishes which source field maps to opposer vs opposed party.

## Phase 3 gate

Before this provider can claim operational acceptance, a manual authenticated probe must establish from real evidence:

1. one real registration number across all three libraries;
2. the actual list response envelope and source-record id field;
3. actual detail envelope and canonical fields;
4. one real party-name request and its parameter/role mapping;
5. page 11 / >100 behavior and whether 100 is a UI cap or backend cap;
6. whether date windows can be partitioned legitimately and completely;
7. whether HTTP 403 in an authenticated session means reauthentication/security challenge or permanent access denial.

Until then `coverageStatus` remains `UNKNOWN`, the schema revision remains candidate/unverified, and ordinary CI performs only synthetic deterministic tests.
