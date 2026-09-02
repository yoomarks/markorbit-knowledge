# CNIPA acquisition intents

Parent: #573  
Implementation: #673

CNIPA judgment acquisition has two distinct product purposes. They must not share the same completeness claim or be collapsed into one generic collection mode.

## 1. DATE_RECENCY_DISCOVERY

Purpose: obtain fresh decision signals for customer development, current-case/content material, market intelligence and downstream recency analysis.

Compatible query mode: `DATE_RANGE`.

Observed ordinary authenticated UI behavior on 2026-09-02:

- all three judgment libraries expose at most 10 visible pages / 100 visible rows;
- the UI reports `100` as the visible total when the ceiling is reached and exposes no page 11;
- date windows can remain saturated even when reduced to one calendar day;
- therefore date partitioning cannot establish exhaustive daily coverage.

This mode is intentionally a **partial recency signal feed**, not a full CNIPA judgment mirror. Saturation at 100 must remain visible as a coverage limitation. No consumer may interpret a date-window result as all decisions issued that day.

Current policy: `currentCoverageCeiling=PARTIAL`, population `COMPLETE` claims forbidden.

The 100-row observation is a UI/business-behavior fact only. It is not yet proof of a backend API hard cap because permitted authenticated raw/source-response evidence is still unavailable.

## 2. REGISTRATION_NUMBER_TARGETED

Purpose: refresh evidence for a known client/prospect mark, support mark-status follow-up and customer relationship maintenance, and verify whether a decision document has appeared when lifecycle/risk intelligence indicates that a check is timely.

Compatible query mode: `REGISTRATION_NUMBER`.

This mode is **target-object evidence acquisition**, not population discovery. The registration/application number must already be known from an authorized upstream source or workflow. Do not enumerate number ranges or use the CNIPA judgment endpoint as a registration-number scanner.

Upstream Brain/rules/intelligence may produce a request such as “check CNIPA decision evidence for this known mark now.” That request is only an acquisition priority/hypothesis. It is not legal truth and must not mutate the mark into rejected/reviewed/opposed state by itself. Only admitted CNIPA source evidence may establish the observed source fact.

Current policy: `currentCoverageCeiling=UNKNOWN` while source identifier and authenticated response schema remain unverified. Population `COMPLETE` claims are forbidden even if one target lookup later becomes query-complete.

## Party-name query

`PARTY_NAME` remains modeled but has no accepted production acquisition intent in this policy revision. Its live request semantics remain fail-closed until permitted evidence justifies a separate use case and authority boundary.

## Live execution boundary remains unchanged

This policy freeze does **not** enable any new CNIPA request.

- `REGISTRATION_NUMBER` remains the only candidate request shape currently emitted by the runtime.
- `DATE_RANGE` and `PARTY_NAME` continue to fail before browser execution.
- no CAPTCHA/SSO bypass, session extraction, request replay, stealth or registration-number enumeration is authorized.
- `CNIPA_JUDGMENT_SCHEMA_STATUS` remains `OPERATOR_SUPPLIED_UNVERIFIED`.
- source identity remains provisional until authenticated list/detail response evidence verifies `adjuOpenId` / `pubId` -> detail `id` semantics.

## Product routing summary

| Intent                         | Query key                             | Primary value                                           | Coverage interpretation                                  |
| ------------------------------ | ------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| `DATE_RECENCY_DISCOVERY`       | Date window                           | Fresh leads, newest decisions, content/material signals | Partial recency feed; never daily completeness           |
| `REGISTRATION_NUMBER_TARGETED` | Known registration/application number | Client-mark monitoring and evidence follow-up           | Target-object evidence only; not population completeness |

The two modes may use the same CNIPA source adapter/evidence pipeline after their request semantics are verified, but their purpose, scheduling, coverage and downstream interpretation remain distinct.
