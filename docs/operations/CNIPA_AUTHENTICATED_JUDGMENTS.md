# CNIPA authenticated trademark judgment acquisition

Status: Phase 1 contract / architecture. No authenticated CNIPA live call is performed by ordinary CI.

Issue: #573

## 1. Why this belongs in Knowledge

This capability is source acquisition and evidence normalization. It therefore belongs inside the existing Knowledge control plane rather than in a standalone anonymous scraping API.

The intended flow is:

```text
Source / CollectionPlan / Run
        |
        v
Controlled Collection Worker
        |
        v
CNIPA authenticated-session executor
        |
        +--> sanitized exact list JSON
        +--> sanitized exact detail JSON
        |
        v
immutable RawArtifact ingestion
        |
        v
CNIPA normalization / staging
        |
        v
existing Knowledge retrieval / internal query surfaces
```

`ArtifactBackedCollectionExecutor` remains the evidence gate. CNIPA acquisition must eventually be exposed as a `CollectionArtifactAcquirer`; it must not bypass Worker leases or write directly to persistence.

## 2. Authentication is an execution boundary

CNIPA authentication/session state is not Knowledge content.

The runtime may eventually use Playwright with a persistent browser profile. An authorized operator completes the first login and any CAPTCHA/security verification manually. Automation may reuse that legitimate session until the site reports that authentication is no longer valid.

The following values are runtime secrets and are forbidden from repository content, logs, RawArtifacts, staging documents and normalized records:

- cookies;
- OAuth/Bearer tokens;
- browser local/session storage values;
- authorization headers;
- CAPTCHA material;
- persistent browser storage-state/profile files.

For this reason, the CNIPA implementation uses `CnipaAuthenticatedSessionExecutor`, a sealed port that accepts only a sanitized request description and returns source-response bytes plus non-secret status metadata. The application layer never receives browser credentials.

Session expiry/security challenge must fail closed as `CNIPA_REAUTH_REQUIRED`. The queue pauses for operator re-login. MarkOrbit must not solve CAPTCHA automatically, forge tokens, bypass SSO, evade access controls or disguise request origin.

## 3. Operator-supplied candidate schema — not yet verified

The following mapping was supplied from a frontend/network inspection. It is deliberately marked `OPERATOR_SUPPLIED_UNVERIFIED` until a controlled authenticated live probe verifies it.

| Document kind              | Candidate list endpoint                        | Candidate detail endpoint        | Candidate party fields            |
| -------------------------- | ---------------------------------------------- | -------------------------------- | --------------------------------- |
| `REGISTRATION_EXAMINATION` | `/pubnotice/portal/tmscJudgment/queryPageList` | `/tmscJudgment/queryInfo?id=...` | `applicantCnName`                 |
| `OPPOSITION_DECISION`      | `/pubnotice/portal/tmyyJudgment/queryPageList` | `/tmyyJudgment/queryInfo?id=...` | `objenderCnName`, `objeperCnName` |
| `REVIEW_ADJUDICATION`      | `/pubnotice/portal/tmpsJudgment/queryPageList` | `/tmpsJudgment/queryInfo?id=...` | `applicantName`, `respondentName` |

The observed registration-number list body is:

```json
{
  "pageIndex": 1,
  "pageSize": 10,
  "regNo": "商标注册号"
}
```

Only this registration-number request shape is represented by the Phase 1 candidate request planner. Party-name and date-range query types exist in the contract, but the adapter fails with `CNIPA_SCHEMA_UNVERIFIED` rather than inventing parameter names that have not been authenticated-live-verified.

Opposition party field semantics also remain unverified. Until the live probe confirms which field is the opposer and which is the opposed party, those two values must retain their original `sourceField` and use the `UNVERIFIED` party role. Do not infer legal roles from spelling alone.

## 4. Canonical Knowledge model

The normalized CNIPA document model is independent of the source JSON envelope:

```ts
{
  identity: "OPPOSITION_DECISION:<sourceRecordId>",
  identityStatus: "PROVISIONAL_UNTIL_AUTHENTICATED_LIVE_VALIDATION",
  documentKind: "OPPOSITION_DECISION",
  sourceRecordId: "...",
  registrationNumber: "...",
  trademarkName: "...",
  decisionDate: "...",
  documentNumber: "...",
  parties: [
    { role: "UNVERIFIED", name: "...", sourceField: "objenderCnName" }
  ],
  contentHtml: "...",
  sourceUri: "...",
  observedSchemaRevision: "candidate-2026-08-29"
}
```

Party roles are modeled explicitly:

- `APPLICANT`
- `RESPONDENT`
- `OPPOSER`
- `OPPOSED_PARTY`
- `UNVERIFIED`

The local deduplication identity is provisionally `documentKind + sourceRecordId`. This is a local deterministic identity only; it must not be promoted as an official CNIPA identifier invariant until a live list/detail probe validates identity semantics.

## 5. Exact evidence and provenance

For every source call the adapter retains the exact **sanitized response body** as bytes with:

- evidence kind (`LIST_JSON` / `DETAIL_JSON`);
- document kind;
- source record id for detail evidence;
- resolved source URI;
- observed timestamp;
- response media type;
- SHA-256;
- exact response bytes.

Phase 2 must transform these evidence objects into normal `AcquiredCollectionArtifact` values and send them through the existing immutable RawArtifact ingestion protocol. No direct database writes are allowed.

The future source decoder must derive normalized fields from the immutable raw evidence. If the response envelope/required fields drift, normalization fails as `CNIPA_SCHEMA_CHANGED`; raw evidence remains available for audit and decoder repair.

## 6. Coverage and the reported 100-result boundary

Until authenticated probing is complete, every CNIPA collection reports:

```text
coverageStatus = UNKNOWN
```

It is not sufficient that page 1 returns successfully.

The controlled live probe must determine:

1. whether `pageIndex > 10` returns additional rows;
2. whether 100 is only a frontend display cap or a backend result cap;
3. what pagination metadata the backend actually returns;
4. whether date queries can be partitioned by day or a smaller legitimate filter;
5. whether any day/window can still exceed an unpartitionable hard cap.

If the source imposes a hard cap that cannot be partitioned using legitimate documented/observed filters, Knowledge must record `PARTIAL` or `UNKNOWN`. It must never label that run `COMPLETE` or synthesize parameters to evade the source limit.

## 7. Error and retry policy

| Code                             | Meaning                                                | Automatic retry                                               |
| -------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| `CNIPA_REAUTH_REQUIRED`          | operator login/session renewal required                | No                                                            |
| `CNIPA_ACCESS_DENIED`            | authenticated request rejected/access denied           | No                                                            |
| `CNIPA_RATE_LIMITED`             | explicit rate limiting                                 | Only through a separately bounded policy after Phase 2 review |
| `CNIPA_SCHEMA_CHANGED`           | response is no longer compatible with verified decoder | No                                                            |
| `CNIPA_COVERAGE_UNKNOWN`         | completeness cannot be established                     | No                                                            |
| `CNIPA_DELIVERY_UNKNOWN`         | browser/session execution result is ambiguous          | No                                                            |
| `CNIPA_SOURCE_TEMPORARY_FAILURE` | explicit server-side 5xx                               | Eligible only for bounded retry policy                        |

The adapter itself performs no hidden retry. This prevents repeated login/security requests and avoids turning an ambiguous browser failure into a retry storm.

## 8. Query API placement

The desired product-facing shape can eventually look conceptually like:

```text
GET documents?reg_no=12345678
GET documents?party_name=某某科技有限公司
```

But the source-facing CNIPA code must not become a public stateless scraper endpoint. The long-running implementation should reuse the existing Knowledge Source / CollectionPlan / Run / Worker architecture and expose results through existing internal/admin retrieval surfaces after evidence is persisted and normalized.

A synchronous source fetch endpoint should not be the system of record. It would bypass leases, RawArtifact provenance, rate controls and re-auth handling.

## 9. Delivery phases

### Phase 1 — deterministic contracts

- typed query/document/party/coverage models;
- sealed authenticated-session executor port;
- candidate endpoint/request planner;
- typed fail-closed error mapping;
- provisional identity;
- exact sanitized evidence representation;
- synthetic fixtures only;
- zero CNIPA network calls in CI.

### Phase 2 — operator-assisted runtime

- Playwright-backed persistent authenticated executor;
- profile/storage state outside repository and treated as a runtime secret;
- manual login/CAPTCHA bootstrap command;
- bounded pacing/request/page limits;
- dedicated `CollectionArtifactAcquirer` wired into the governed Worker;
- exact list/detail JSON -> immutable RawArtifact;
- session expiry pauses the job for operator re-authentication.

### Phase 3 — authenticated live acceptance

Use a manual-only operator workflow/command to validate:

- one real registration number across all three libraries;
- one real party-name query;
- list/detail field and source-id mapping;
- opposition party role semantics;
- page 11 / >100 behavior;
- coverage completeness rules.

Only after this evidence exists may candidate constants be promoted from `OPERATOR_SUPPLIED_UNVERIFIED` to a verified schema revision.
