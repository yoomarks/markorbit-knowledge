# CNIPA Phase 3 manual authenticated live acceptance

Status: partial Phase 3 authenticated validation. Operator-controlled ordinary Chrome capture has now produced authenticated raw judgment LIST/DETAIL evidence, and REVIEW_ADJUDICATION hidden date pagination has been promoted into the runtime. The direct Playwright-authenticated production session remains separately gated, and registration/opposition date-range hidden paging still requires equivalent raw verification.

Current permitted evidence layers are:

- operator-controlled ordinary Chrome capture of bounded judgment LIST/DETAIL responses, with credentials/headers/session material excluded from exported evidence;
- operator-retrieved official frontend static code for request construction, frontend-consumed fields and client expectations;
- ordinary-Chrome manual UI observation for visible business behavior;
- ordinary-Chrome Default-mode `chrome://net-export/` for bounded transport/status observations;
- the offline Response-only assessor for sanitized captured JSON files.

Parent issue: #573  
Implementation issue: #576  
Official frontend static-contract issue: #624  
Frontend client-expectations issue: #627  
Frontend consumed-fields issue: #630  
Offline authenticated response-bundle issue: #633  
Manual UI observation issue: #636  
Acquisition-intent issue: #673  
Visible-window evidence issue: #675

## Safety boundary

Phase 3 exists only to collect controlled evidence needed to verify the currently `OPERATOR_SUPPLIED_UNVERIFIED` CNIPA candidate mappings.

Do **not** solve or bypass CAPTCHA/SSO/access controls, change browser fingerprints/UA for evasion, rotate proxies, extract/replay cookies or bearer tokens, export browser profiles, attach automation to the ordinary logged-in browser, use browser console/bookmarklets/userscripts to issue authenticated requests, or turn CNIPA into a public scraping endpoint.

Normal PR CI must remain zero-CNIPA-request. Raw evidence, probe plans and private operator inputs remain outside the repository.

## Historical Playwright gate and current operator path

A/B testing on 2026-09-01 established that the direct Playwright persistent-session path was blocked while ordinary Chrome remained usable. That remains a historical constraint on the production Playwright harness, not a prohibition on the later operator-controlled ordinary-Chrome capture path.

By 2026-09-17/18, sanitized authenticated raw LIST/DETAIL response capture was successfully obtained from ordinary Chrome without exporting cookies, Authorization headers or bearer values. Review date queries were then replay-tested with only pagination fields changed, proving hidden backend offsets beyond the visible 100-row window.

Consequences:

- do not bypass CAPTCHA/SSO or extract/replay session credentials;
- keep the direct Playwright production-session gate separate from the browser-capture evidence path;
- use captured raw JSON plus `docs/operations/CNIPA_AUTHENTICATED_JUDGMENTS.md` for currently verified Review runtime behavior;
- use `docs/operations/CNIPA_ACQUISITION_INTENTS.md` for coverage/intended-use boundaries;
- keep registration/opposition DATE_RANGE fail-closed until equivalent raw hidden-pagination evidence is verified.

## Authentication architecture evidence - 2026-09-17

Sanitized operator observations add a separate authentication-architecture evidence layer:

- Trademark Query (`wcjs.sbj.cnipa.gov.cn`) and the public judgment/publication applications were observed to share one SSO login state at the user-visible layer.
- Authenticated `GET /api/user/getInfo` in Trademark Query returned a sanitized structural observation with `data.user.clientId = "trademark_query"`. No account fields, cookies, tokens, OAuth code/state values, browser storage, or profile data are retained.
- Operator-retrieved official static JavaScript contains an OAuth navigation relationship for `state=portalui-pub-prod/brandNotice` using `client_id=trademark_three_public` and redirect URI `https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/pubauth/login`.

This proves that a portal route name cannot be treated as its OAuth `clientId`: `brandNotice` is routed through `trademark_three_public`, while Trademark Query reports `trademark_query`. Therefore `trademarkObjection -> trademarkObjection` and `trademarkRegistration -> trademarkRegistration` are explicitly **not verified**. Their client allocation, and the review-adjudication route client allocation, remain `UNVERIFIED` until their own permitted static/runtime evidence is available.

This authentication evidence, by itself, does not promote any judgment backend fact. Independent authenticated review captures now verify the REVIEW_ADJUDICATION LIST envelope and hidden-pagination behavior; those findings are tracked separately in the acquisition/runtime evidence and do not come from the authentication evidence described here. Authentication evidence still does not establish registration/opposition response semantics, population completeness, or judgment-route OAuth client allocation. `CNIPA_JUDGMENT_SCHEMA_STATUS` remains `OPERATOR_SUPPLIED_UNVERIFIED`.

## Observed transport boundary

Sanitized ordinary-Chrome Default-mode NetLog has established only these transport facts:

- host: `pub.sbj.cnipa.gov.cn`;
- API prefix: `/toas-pub-prod/pub-prod-api/pubnotice/portal`;
- registration examination list/detail: `POST` to `tmscJudgment/queryPageList` and `tmscJudgment/queryInfo?id=...`;
- opposition decision list/detail: `POST` to `tmyyJudgment/queryPageList` and `tmyyJudgment/queryInfo?id=...`;
- review adjudication list/detail: `POST` to `tmpsJudgment/queryPageList` and `tmpsJudgment/queryInfo?id=...`;
- detail query parameter key `id` was observed.

The sanitizer exposes only allowlisted query parameter names and no request payload/response body. These observations therefore do **not** verify request values, response schema, list -> detail identity semantics, party-role semantics, backend pagination/date limits or coverage.

## Official frontend static-code evidence boundary

Operator-retrieved official CNIPA portal static application code separately establishes frontend request construction and client expectations.

Observed list request fields:

- registration examination: `regNo`, `tmName`, `applicantCnName`, `returnDateStart`, `returnDateEnd`, `pageIndex`, `pageSize`; no fixed `openFlag` observed;
- opposition decision: fixed `openFlag: 1`, plus `regNo`, `tmName`, `objenderCnName`, `objeperCnName`, `objenderAgentName`, `objeperAgentName`, `returnDateStart`, `returnDateEnd`, `pageIndex`, `pageSize`;
- review adjudication: fixed `openFlag: 1`, plus `regNo`, `tmName`, `applicantName`, `respondentName`, `judgeDateStart`, `judgeDateEnd`, `pageIndex`, `pageSize`.

The frontend passes registration/opposition row `adjuOpenId` and review row `pubId` into route query `id`, then the corresponding detail wrapper sends `queryInfo?id=...`.

The shared Axios success interceptor returns Axios `response.data`. At the feature level, list pages expect the parsed JSON body to expose `data.list` and `data.total`; detail pages expect `data`. The frontend also consumes:

- registration list: `adjuOpenId`, `regNo`, `tmName`, `applicantCnName`, `returnDateStr`;
- opposition list: `adjuOpenId`, `regNo`, `tmName`, `objenderCnName`, `objeperCnName`, `returnDateStr`;
- review list: `pubId`, `regNo`, `tmName`, `applicantName`, `respondentName`, `judgeDate`;
- shared detail view: `title`, `source`, `sendNoStr`, `fileContent`, optional `returnDate`.

The UI labels imply applicant/opposer/opposed-party/respondent intent for the relevant fields. All three pages initialize page index `1`, page size `10`, consume `data.total`, expose normal pagination controls, and the date picker disables candidate dates more than 30 days from the selected counterpart.

These are **static client expectations and UI intent**, not authenticated live source-field verification. They do not prove current server conformance, populated/correct values, normalized Knowledge semantics, backend limits, real list/detail source-record consistency or coverage. `CNIPA_JUDGMENT_SCHEMA_STATUS` therefore remains `OPERATOR_SUPPLIED_UNVERIFIED`.

## Current manual UI business-behavior path

Use `docs/operations/CNIPA_MANUAL_UI_OBSERVATION.md` while ordinary Chrome remains the only usable session path and DevTools is unavailable.

That workflow uses only normal visible site controls and returns no real registration number, trademark name or party name to GitHub. It records sanitized observations for:

- one real registration-number search across all three judgment libraries;
- one real party-name query and visible UI role/match behavior;
- visible row -> detail correspondence;
- the visible result-window ceiling, page count and ordering behavior;
- whether one-day date windows can still saturate the visible ceiling;
- the visible >30-day date-picker restriction.

Manual UI evidence can promote only bounded statements such as `REGISTRATION_NUMBER_UI_BEHAVIOR_OBSERVED`, `PARTY_NAME_UI_BEHAVIOR_OBSERVED`, `UI_DETAIL_CORRESPONDENCE_OBSERVED`, `UI_VISIBLE_100_ROW_CEILING_OBSERVED`, `UI_SINGLE_DAY_SATURATION_OBSERVED`, `UI_LATEST_FIRST_ORDERING_OBSERVED` and `UI_DATE_PICKER_CONSTRAINT_OBSERVED`.

It does **not** verify raw JSON/source fields, real sourceRecordId identity, backend-only caps, authenticated 403 meaning or complete coverage.

## Accepted visible-window observation - 2026-09-02

Authorized ordinary-Chrome observation now establishes the following current UI/business behavior across the three judgment libraries:

- a saturated result set is visibly reported as exactly 100 results / 10 pages;
- no page-11 control is exposed;
- the UI does not display a greater underlying total when saturated;
- date-window queries can remain at the 100-row ceiling as the window is narrowed;
- a one-calendar-day query can still remain saturated at 100;
- visible results were observed ordered by newest date first.

This replaces the earlier `page 11 / >100 = NOT_TESTED` UI status. The **UI cap is now observed**.

Later authenticated raw REVIEW_ADJUDICATION evidence resolved the backend question for that library: `pageSize=100` is accepted, `pageSize=200` is rejected, and requested `pageIndex=2,3,4,5` returns new offsets even though every response continues to report clamped `pageIndex=1 / pages=1 / total=100`. A 2026-07-01 run produced 435 unique `pubId` values as `100 + 100 + 100 + 100 + 35`. Therefore the visible 100-row ceiling is not a Review backend offset cap. Registration/opposition hidden-pagination behavior remains separately unverified.

`DATE_RECENCY_DISCOVERY` remains a partial fresh-signal acquisition intent by policy; hidden paging improves acquisition depth but does not by itself authorize a CNIPA population `COMPLETE` claim.

## Offline Response-only capability - implemented and usable with sanitized captures

#633/#635 added `docs/operations/CNIPA_OFFLINE_RESPONSE_BUNDLE.md` and a zero-network local assessor. When a permitted selected Response JSON file exists, it can:

- validate the frozen document kind/surface/POST/path contract;
- reject credential-like descriptor fields and unsafe response paths;
- hash and structure-check bounded local response files;
- record JSON validity and expected-field presence without copying response values into the manifest;
- leave production decoder/schema/coverage state unchanged.

The earlier input-blocked state has been superseded by the operator-controlled capture extension, which can export sanitized response JSON without persisting headers, cookies or Authorization values. The offline assessor therefore remains usable for captured artifacts. Do not broaden that capability into credential/session extraction.

## Future authenticated Playwright harness

Only if CNIPA later permits the supported headed Playwright session path, configure the existing runtime environment and complete login/CAPTCHA manually. The retained operator entry point is:

```text
pnpm.cmd --filter @markorbit/worker cnipa:session:login
```

External probe plans remain outside the repository. The live harness accepts only the frozen CNIPA list/detail endpoint surface, requires POST, and requires the observed `id` query key for detail probes.

Local plan validation remains zero-network:

```text
pnpm.cmd --filter @markorbit/worker cnipa:acceptance:live -- --plan "D:\markorbit-private\cnipa\probe-plan.json"
```

A future site-permitted bounded live execution still requires the explicit switch and external output directory:

```text
pnpm.cmd --filter @markorbit/worker cnipa:acceptance:live -- `
  --plan "D:\markorbit-private\cnipa\probe-plan.json" `
  --output "D:\markorbit-private\cnipa\evidence\<run-folder>" `
  --execute-live-cnipa
```

Do not execute this while the current Playwright access-control gate remains.

## Remaining Phase 3 acceptance facts

The remaining items are now split by evidence availability.

### Already established through ordinary UI

1. one real registration-number search across all three document libraries at visible UI/business-behavior level;
2. one real party-name query and visible role/match behavior;
3. visible list-row -> detail correspondence, explicitly **not** sourceRecordId verification;
4. visible 100-result / 10-page ceiling with no page-11 control;
5. visible one-day date-window saturation at 100 and newest-date-first ordering;
6. visible >30-day date-picker restriction.

### Authenticated raw Review facts now established

1. REVIEW_ADJUDICATION LIST responses use the observed `data.list` / `data.total` envelope and `pubId` source identifier;
2. Review LIST rows include full `fileContent`, allowing bulk LIST evidence without per-record DETAIL fan-out;
3. Review `pubId` -> detail `id` binding was observed on a matched LIST/DETAIL pair;
4. Review hidden pagination can exceed the visible 100-row window and must be driven by requested `pageIndex`, not returned pagination metadata;
5. transient divide-layer business codes `-102/-107` can be retried with bounded backoff because unchanged requests later succeeded.

### Remaining raw/live acceptance facts

1. registration-examination DATE_RANGE request/hidden-pagination behavior beyond the visible 100-row window;
2. opposition DATE_RANGE request/hidden-pagination behavior beyond the visible 100-row window;
3. any still-unverified opposition detail/source-role semantics;
4. authenticated 403 business/security semantics through a supported production session path;
5. final global schema-version promotion and any population-level coverage classification.

Until those separate facts are verified, keep unverified combinations fail-closed, retain `CNIPA_JUDGMENT_SCHEMA_STATUS = OPERATOR_SUPPLIED_UNVERIFIED`, and keep coverage `UNKNOWN` or `PARTIAL` as applicable. Never infer `COMPLETE` population coverage from the UI or from one verified daily Review run.
