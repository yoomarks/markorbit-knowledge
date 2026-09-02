# CNIPA Phase 3 manual authenticated live acceptance

Status: operator-only acceptance. The Playwright-authenticated live path is currently blocked by an observed CNIPA access-control gate, and the operator has confirmed that the currently usable ordinary-Chrome CNIPA portal does not provide a usable DevTools path. Do not bypass either limitation.

Current permitted evidence layers are:

- ordinary-Chrome Default-mode `chrome://net-export/` for bounded transport/status observations;
- operator-retrieved official frontend static code for request construction, frontend-consumed fields and UI intent/client expectations;
- ordinary-Chrome **manual UI observation** for visible business behavior that does not require DevTools;
- the offline Response-only assessor implemented by #633/#635, but only when a site/session legitimately provides a permitted way to save selected Response JSON bodies. That input path is not currently available on the operator's CNIPA session.

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

## Current authentication and observation gate

A/B testing on 2026-09-01 established:

- ordinary Chrome can use the current CNIPA public portal;
- the same portal path is blocked when launched through the Playwright persistent-session route;
- therefore the Playwright failure is treated as an external access-control/anti-automation gate, not a local executable/profile defect;
- the operator has separately confirmed that the usable ordinary-Chrome CNIPA portal does not provide a usable DevTools path.

Consequences:

- do not execute the Playwright live acceptance path while this gate remains;
- do not instruct the operator to use DevTools on the current site path;
- do not enable sensitive NetLog/raw-byte capture merely to reconstruct response bodies;
- use `docs/operations/CNIPA_OFFLINE_NETLOG_EVIDENCE.md` for transport evidence;
- use `CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE` for static request/client expectations;
- use `docs/operations/CNIPA_MANUAL_UI_OBSERVATION.md` for current visible business-behavior evidence;
- use `docs/operations/CNIPA_ACQUISITION_INTENTS.md` for the frozen distinction between recency discovery and targeted known-mark follow-up;
- retain `docs/operations/CNIPA_OFFLINE_RESPONSE_BUNDLE.md` as an implemented safe capability for a future environment/session where selected Response JSON can legitimately be saved without extracting authentication material.

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

## Accepted visible-window observation — 2026-09-02

Authorized ordinary-Chrome observation now establishes the following current UI/business behavior across the three judgment libraries:

- a saturated result set is visibly reported as exactly 100 results / 10 pages;
- no page-11 control is exposed;
- the UI does not display a greater underlying total when saturated;
- date-window queries can remain at the 100-row ceiling as the window is narrowed;
- a one-calendar-day query can still remain saturated at 100;
- visible results were observed ordered by newest date first.

This replaces the earlier `page 11 / >100 = NOT_TESTED` UI status. The **UI cap is now observed**.

It does not establish the corresponding backend semantics. In particular, this evidence does not prove that the authenticated API hard-caps `data.total` or retrievable rows at 100, whether an unexposed page 11 exists server-side, or what the true result population is.

The single-day saturation also proves that date partitioning alone cannot establish complete daily coverage. Per #673/#674, `DATE_RECENCY_DISCOVERY` is therefore a partial fresh-signal acquisition intent, while `REGISTRATION_NUMBER_TARGETED` is a separate target-object evidence-follow-up intent for known marks. Neither intent authorizes a CNIPA population `COMPLETE` claim.

## Offline Response-only capability — implemented but currently input-blocked

#633/#635 added `docs/operations/CNIPA_OFFLINE_RESPONSE_BUNDLE.md` and a zero-network local assessor. When a permitted selected Response JSON file exists, it can:

- validate the frozen document kind/surface/POST/path contract;
- reject credential-like descriptor fields and unsafe response paths;
- hash and structure-check bounded local response files;
- record JSON validity and expected-field presence without copying response values into the manifest;
- leave production decoder/schema/coverage state unchanged.

On the current CNIPA ordinary-Chrome path, the operator cannot use DevTools to save those Response bodies, so this capability is **not currently executable**. Do not work around that by using sensitive NetLog modes, session extraction or browser scripting.

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

### Still blocked on a permitted raw/source-response channel

1. authenticated JSON response conformance and current live source fields;
2. real list -> detail source-record identifier consistency (`adjuOpenId` / `pubId` -> query `id` -> response identity);
3. backend-only pagination/result-cap semantics, including real `data.total` behavior behind the observed 100-row UI ceiling;
4. backend date-window behavior beyond the UI restriction;
5. authenticated 403 business/security semantics through a supported authenticated execution path;
6. final schema-version promotion and coverage classification.

Until separate permitted evidence supports those blocked facts, keep `CNIPA_JUDGMENT_SCHEMA_STATUS = OPERATOR_SUPPLIED_UNVERIFIED` and coverage `UNKNOWN` or `PARTIAL` as applicable. Never claim `COMPLETE` coverage from UI observations alone.
