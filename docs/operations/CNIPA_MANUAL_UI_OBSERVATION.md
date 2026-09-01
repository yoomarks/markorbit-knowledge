# CNIPA Phase 3 manual UI observation

Status: current operator path for visible CNIPA business-behavior evidence when ordinary Chrome works but DevTools and the Playwright session path are unavailable.

Parent issue: #573  
Implementation issue: #636

## Purpose

This runbook captures only facts an authorized operator can observe through the ordinary CNIPA web UI itself. It is deliberately narrower than raw response/schema validation.

Use it to answer bounded Phase 3 questions that remain observable without DevTools:

- does one real registration number produce a visible result in each of the three judgment libraries;
- does a real party-name query produce a visible matching row under the expected UI role label;
- does selecting a visible list row open a detail document that visibly corresponds to that row;
- when the ordinary UI exposes more than 100 results, can the operator navigate to page 11 and obtain visible rows;
- does the ordinary date picker prevent selecting a date pair whose difference exceeds 30 days.

## Safety boundary

Use only the ordinary authenticated CNIPA page and normal visible controls.

Do **not** use:

- DevTools or browser network inspectors;
- browser console, `javascript:` URLs, bookmarklets, userscripts, extensions or injected scripts;
- Copy as cURL, HAR export or request replay;
- sensitive `chrome://net-export/` modes that include credentials/raw bytes for the purpose of reconstructing responses;
- cookies, bearer tokens, storage state, browser profiles or authentication material;
- Playwright/CDP attachment to the ordinary logged-in browser;
- stealth/fingerprint changes, CAPTCHA automation, proxy rotation or any other access-control bypass.

The existing Default-mode NetLog workflow remains the permitted transport-evidence path. This manual UI workflow is separate and records visible business behavior only.

## Privacy boundary

Real registration numbers, trademark names, party names and case/document text remain local to the operator.

Do not paste those values into GitHub, PRs, issues or the sanitized observation result. Do not commit screenshots. If the operator keeps local screenshots for private reference, they remain outside Git and are not required by this workflow.

Use only the result categories defined below.

## Observation A — one registration number across all three libraries

Choose one real registration number that the operator is authorized to use. Keep the value private.

Using the normal CNIPA UI, perform the registration-number search separately in:

1. registration examination;
2. opposition decision;
3. review adjudication.

For each library record only:

- `result`: `NON_EMPTY`, `EMPTY`, `ERROR_OR_BLOCKED`, or `NOT_TESTED`;
- `visibleRegistrationMatch`: whether at least one visible result row clearly corresponds to the privately entered registration number;
- `detailOpened`: whether normal row/detail navigation opens a detail document;
- `detailCorrespondenceConfirmed`: whether the visible detail can reasonably be matched to the selected row using visible non-secret case/document context.

`detailCorrespondenceConfirmed` is **UI-level correspondence only**. It does not validate `adjuOpenId`, `pubId`, query `id`, or any raw source-record identifier.

## Observation B — one party-name query

Choose one real party name the operator is authorized to use and keep the value private.

Use one library/role combination that can reasonably produce a result. Record only:

- `documentKind`;
- `uiRole`: `APPLICANT`, `OPPOSER`, `OPPOSED_PARTY`, or `RESPONDENT`;
- `result`: `NON_EMPTY`, `EMPTY`, `ERROR_OR_BLOCKED`, or `NOT_TESTED`;
- `visibleNameMatch`: whether a returned visible row shows the privately entered party name under the selected role/column;
- `roleLabelObserved`: whether the ordinary UI visibly labels that field/column consistently with the selected role.

This can support **live UI business behavior and role-label intent**. It does not prove raw source-field semantics or authorize production party-name execution by itself.

## Observation C — page 11 / more than 100 visible results

Use only a normal UI query that naturally exposes more than 100 results. Do not weaken or bypass any site limit.

Record:

- `uiIndicatesOver100Results`: whether the ordinary UI indicates more than 100 results;
- `page11ControlAvailable`: whether page 11 can be reached through the normal pagination UI;
- `page11Loaded`: whether page 11 loads successfully;
- `page11HasVisibleRows`: whether page 11 contains visible result rows;
- `uiStopsBeforePage11`: whether the UI visibly prevents navigating that far.

A successful page 11 observation proves only visible UI/business behavior for that query. It does not establish that the backend has no other result cap or that collection coverage is complete.

If no authorized ordinary query naturally produces more than 100 results, report `NOT_TESTED`; do not manufacture broad requests solely to stress the service.

## Observation D — visible date-picker constraint

Using the ordinary UI date picker only, test whether the control allows choosing endpoints more than 30 days apart.

Record:

- `over30DaySelectionBlocked`: `true`, `false`, or `null` when not tested;
- `observation`: `UI_CONTROL_ONLY`.

This confirms only current UI behavior. It does not prove a backend date-window limit.

## Sanitized result template

Copy only this structure back into the engineering conversation. Do not replace any field with the real registration number or party name.

```json
{
  "evidenceKind": "CNIPA_MANUAL_UI_OBSERVATION_V1",
  "registrationAcrossLibraries": {
    "REGISTRATION_EXAMINATION": {
      "result": "NOT_TESTED",
      "visibleRegistrationMatch": null,
      "detailOpened": null,
      "detailCorrespondenceConfirmed": null
    },
    "OPPOSITION_DECISION": {
      "result": "NOT_TESTED",
      "visibleRegistrationMatch": null,
      "detailOpened": null,
      "detailCorrespondenceConfirmed": null
    },
    "REVIEW_ADJUDICATION": {
      "result": "NOT_TESTED",
      "visibleRegistrationMatch": null,
      "detailOpened": null,
      "detailCorrespondenceConfirmed": null
    }
  },
  "partyName": {
    "documentKind": null,
    "uiRole": null,
    "result": "NOT_TESTED",
    "visibleNameMatch": null,
    "roleLabelObserved": null
  },
  "pagination": {
    "uiIndicatesOver100Results": null,
    "page11ControlAvailable": null,
    "page11Loaded": null,
    "page11HasVisibleRows": null,
    "uiStopsBeforePage11": null
  },
  "dateUi": {
    "over30DaySelectionBlocked": null,
    "observation": "UI_CONTROL_ONLY"
  },
  "devtoolsUsed": false,
  "automationUsed": false,
  "credentialMaterialCollected": false
}
```

## Interpretation rules

Manual UI evidence may support these bounded statements:

- `REGISTRATION_NUMBER_UI_BEHAVIOR_OBSERVED`;
- `PARTY_NAME_UI_BEHAVIOR_OBSERVED`;
- `UI_ROLE_LABEL_AND_VISIBLE_MATCH_OBSERVED`;
- `UI_DETAIL_CORRESPONDENCE_OBSERVED`;
- `UI_PAGE_11_BEHAVIOR_OBSERVED`;
- `UI_DATE_PICKER_CONSTRAINT_OBSERVED`.

It must **not** be promoted into any of the following without a separate permitted evidence source:

- authenticated raw HTTP JSON schema/source-field conformance;
- real source-record ID or list -> detail identifier consistency;
- backend-only pagination/result/date limits;
- normalized Knowledge party-role/source-field semantics;
- authenticated 403 meaning;
- exhaustive coverage or `COMPLETE` coverage;
- a verified `CNIPA_JUDGMENT_SCHEMA_STATUS`.

## Current blocked facts

Because the current ordinary-Chrome CNIPA path does not provide usable DevTools and the Playwright session is blocked by the observed access-control gate, raw authenticated response/schema validation remains externally blocked.

Do not turn that blocker into a request for sensitive NetLog capture, session extraction or browser automation. Keep the remaining schema/source-ID acceptance items open until a site-permitted source-response channel exists.
