# CNIPA authenticated trademark judgment acquisition

Status: Phase 2 runtime plus partial Phase 3 authenticated validation. Ordinary CI performs no CNIPA request and launches no real browser. Authenticated raw evidence now verifies REVIEW_ADJUDICATION and OPPOSITION_DECISION date-range request shapes and hidden-pagination behavior; registration date pagination and other request/semantic mappings remain gated.

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

`PARTY_NAME` and registration-examination `DATE_RANGE` requests still fail before browser launch. `DATE_RANGE` is enabled for an explicit `["REVIEW_ADJUDICATION"]` or `["OPPOSITION_DECISION"]` selection using the authenticated-raw-verified date request shape for that library.

## Bounded pagination and cache

Targeted registration-number acquisition retains the conservative metadata-driven pagination rule: it advances only when decoded `hasMore=true` or decoded `total` proves another page exists.

Authenticated review/opposition date-range acquisition uses a different, evidence-backed rule. CNIPA was observed to honor requested `pageIndex` offsets while clamping response `pageIndex/pages/total` to the visible 100-result window. For this verified surface the adapter therefore ignores those pagination metadata fields, uses `pageSize=100`, and advances requested `pageIndex` until it observes an empty page, a short page, a full page with no new source ids, or the configured safety ceiling. A captured `2026-07-01` run produced 435 unique review `pubId` values as `100 + 100 + 100 + 100 + 35`.

Bulk date-range defaults are 100 rows per page and at most 50 pages; targeted defaults remain 10 rows and 10 pages. Reaching a ceiling keeps `coverageStatus=UNKNOWN` and records an explicit coverage reason. Review/opposition date-range bulk mode preserves LIST JSON and skips per-record DETAIL fan-out.

The Playwright executor has an additional per-run request ceiling and a minimum request interval. Identical requests inside one run are served from an in-memory response cache, so retry/re-entry inside the same deterministic acquisition does not duplicate a CNIPA request. Cache entries never contain session credentials.

No ambiguous browser/network failure is replayed automatically. It remains `CNIPA_DELIVERY_UNKNOWN`.

Authenticated review captures also observed two explicit divide-layer business responses that later succeeded unchanged for the same request:

- `code=-102`: `divide:Rule not found!`
- `code=-107`: `divide:Can not find selector, please check your configuration!`

These two responses are treated differently from transport uncertainty because the server returned a definite HTTP/JSON result. The adapter retries only these observed business codes with a bounded exponential backoff (default 3 attempts, 250 ms base delay, capped at 2 seconds). Intermediate transient bodies are discarded rather than admitted as RawArtifact evidence. If the bounded budget is exhausted, the run fails as `CNIPA_SOURCE_TEMPORARY_FAILURE` with `retryable=true`. Browser/network/session ambiguity still receives no automatic replay.

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

The targeted registration-number list body remains supported:

```json
{ "pageIndex": 1, "pageSize": 10, "regNo": "..." }
```

Authenticated raw evidence also verifies this opposition date-range shape:

```json
{
  "openFlag": 1,
  "regNo": "",
  "tmName": "",
  "objenderCnName": "",
  "objeperCnName": "",
  "objenderAgentName": "",
  "objeperAgentName": "",
  "returnDateStart": "2026-07-01",
  "returnDateEnd": "2026-07-09",
  "pageIndex": 1,
  "pageSize": 100
}
```

A captured run produced 1,597 unique `adjuOpenId` values as fourteen full hidden 100-row pages after the base page plus a final 97-row page. The first hidden request recovered from an observed transient HTTP 404 on retry. Returned pagination metadata remained clamped to the visible 100-result window.

Authenticated raw evidence additionally verifies this review date-range shape:

```json
{
  "openFlag": 1,
  "regNo": "",
  "tmName": "",
  "applicantName": "",
  "respondentName": "",
  "judgeDateStart": "2026-07-01",
  "judgeDateEnd": "2026-07-01",
  "pageIndex": 1,
  "pageSize": 100
}
```

For subsequent hidden pages only `pageIndex` changes; returned pagination metadata is not trusted for this verified mode.

A minimal authenticated-raw-verified response mapping for review bulk LIST acquisition is:

```json
{
  "list": {
    "recordsPath": ["data", "list"],
    "sourceRecordIdField": "pubId",
    "totalPath": ["data", "total"]
  },
  "detail": {}
}
```

`detail` remains present because the connector schema contract requires the object, but review `DATE_RANGE` bulk mode does not fan out DETAIL requests. The observed LIST rows already carry `fileContent` and are preserved verbatim as RawArtifact evidence.

Authenticated opposition LIST text establishes `objenderCnName` as the opposer and `objeperCnName` as the opposed party for the observed records. Multi-opposer completeness must still be derived from preserved `fileContent`; the scalar LIST field must not be treated as the complete party list.

## v0.7 capture-dataset offline assessment

The operator capture extension v0.7 exports a normalized `mo-cnipa-query-dataset-v2` JSON file after a bounded current-query sweep. Before promoting registration/opposition DATE_RANGE behavior, assess the exported file offline:

```text
pnpm --filter @markorbit/worker cnipa:evidence:assess-capture-dataset -- --input "<dataset.json>"
```

Optionally add `--output "<assessment.json>"` to create a new summary file. The assessor performs no network request and does not copy trademark numbers, party names, document text, or source ids into its report. It records only the input SHA-256 and structural/count/pagination findings.

A dataset is `runtimeDateRangeReady=true` only when the v0.7 schema/kind/source route match, the base query is `pageIndex=1/pageSize=100` with the expected date fields, every exported LIST row has the canonical source id and non-empty `fileContent`, no duplicate ids exist, hidden pages are contiguous from page 2 with new unique ids beyond the first 100, and the sweep terminates on a short or empty page. A repeated page remains a safe runtime stop condition but is not sufficient evidence for automatic DATE_RANGE promotion.

## Phase 3 gate

Before this provider can claim operational acceptance, a manual authenticated probe must establish from real evidence:

1. one real registration number across all three libraries;
2. the actual list response envelope and source-record id field;
3. actual detail envelope and canonical fields;
4. one real party-name request and its parameter/role mapping;
5. registration/opposition page-11 / >100 behavior (review >100 behavior is now raw-verified: 100 is a visible-metadata window, not a review backend offset cap);
6. registration/opposition date request shapes and whether their hidden pagination matches the verified review behavior;
7. whether HTTP 403 in an authenticated session means reauthentication/security challenge or permanent access denial.

Until then `coverageStatus` remains `UNKNOWN`, the schema revision remains candidate/unverified, and ordinary CI performs only synthetic deterministic tests.
