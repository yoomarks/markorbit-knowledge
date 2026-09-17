# CNIPA acquisition intents

Parent: #573  
Implementation: #673

CNIPA judgment acquisition has two distinct product purposes. They must not share the same completeness claim or be collapsed into one generic collection mode.

## 1. DATE_RECENCY_DISCOVERY

Purpose: obtain fresh decision signals for customer development, current-case/content material, market intelligence and downstream recency analysis.

Compatible query mode: `DATE_RANGE`.

Observed behavior now has two layers:

- the authenticated public UI still exposes at most 100 visible rows and reports `total=100` / `pages=1` when `pageSize=100`;
- authenticated raw `REVIEW_ADJUDICATION` captures show that the backend nevertheless honors requested `pageIndex=2,3,...` offsets beyond that visible window;
- on `2026-07-01`, hidden review pagination returned 435 unique `pubId` values as `100 + 100 + 100 + 100 + 35` while every hidden response continued to report the clamped 100-row pagination metadata;
- `pageSize=200` is rejected, so the verified bulk strategy keeps `pageSize=100` and advances `pageIndex` until an empty/short/no-new-id stop condition or the configured safety ceiling.

This mode remains intentionally a **partial recency signal feed**, not a claim that MarkOrbit mirrors the complete CNIPA judgment population. Hidden pagination removes the previously assumed 100-row acquisition barrier for the verified review surface, but it does not by itself prove historical/population completeness.

Current policy: `currentCoverageCeiling=PARTIAL`, population `COMPLETE` claims forbidden.

## 2. REGISTRATION_NUMBER_TARGETED

Purpose: refresh evidence for a known client/prospect mark, support mark-status follow-up and customer relationship maintenance, and verify whether a decision document has appeared when lifecycle/risk intelligence indicates that a check is timely.

Compatible query mode: `REGISTRATION_NUMBER`.

This mode is **target-object evidence acquisition**, not population discovery. The registration/application number must already be known from an authorized upstream source or workflow. Do not enumerate number ranges or use the CNIPA judgment endpoint as a registration-number scanner.

Upstream Brain/rules/intelligence may produce a request such as “check CNIPA decision evidence for this known mark now.” That request is only an acquisition priority/hypothesis. It is not legal truth and must not mutate the mark into rejected/reviewed/opposed state by itself. Only admitted CNIPA source evidence may establish the observed source fact.

Current policy: `currentCoverageCeiling=UNKNOWN` while source identifier and authenticated response schema remain unverified. Population `COMPLETE` claims are forbidden even if one target lookup later becomes query-complete.

## Party-name query

`PARTY_NAME` remains modeled but has no accepted production acquisition intent in this policy revision. Its live request semantics remain fail-closed until permitted evidence justifies a separate use case and authority boundary.

## Live execution boundary

Authenticated raw evidence now promotes one bounded date-range request shape in addition to targeted registration-number lookup:

- `DATE_RANGE` is enabled only when `documentKinds` is exactly `["REVIEW_ADJUDICATION"]`;
- the verified review request uses `judgeDateStart`, `judgeDateEnd`, `pageSize=100`, and explicit hidden `pageIndex` progression;
- review bulk acquisition preserves exact LIST JSON as primary evidence and intentionally skips per-record DETAIL fan-out because the observed LIST rows already contain `fileContent`;
- registration/opposition `DATE_RANGE` and all `PARTY_NAME` production requests remain fail-closed until equivalent authenticated raw evidence is supplied;
- no CAPTCHA/SSO bypass, credential persistence, stealth or registration-number enumeration is introduced;
- `CNIPA_JUDGMENT_SCHEMA_STATUS` remains `OPERATOR_SUPPLIED_UNVERIFIED` and population `COMPLETE` claims remain forbidden.

## Product routing summary

| Intent                         | Query key                             | Primary value                                           | Coverage interpretation                                  |
| ------------------------------ | ------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| `DATE_RECENCY_DISCOVERY`       | Date window                           | Fresh leads, newest decisions, content/material signals | Partial recency feed; never daily completeness           |
| `REGISTRATION_NUMBER_TARGETED` | Known registration/application number | Client-mark monitoring and evidence follow-up           | Target-object evidence only; not population completeness |

The two modes may use the same CNIPA source adapter/evidence pipeline after their request semantics are verified, but their purpose, scheduling, coverage and downstream interpretation remain distinct.
