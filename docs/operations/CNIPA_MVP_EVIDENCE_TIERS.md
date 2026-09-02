# CNIPA MVP evidence tiers and closeout

Parent MVP: #573  
Backend verification follow-up: #691  
Acquisition-intent policy: `docs/operations/CNIPA_ACQUISITION_INTENTS.md`

This document is the authoritative evidence-tier and closeout policy for the bounded CNIPA authenticated trademark-judgment acquisition MVP.

The MVP does not require backend-only facts to be invented or promoted beyond the evidence available. Backend raw-response/schema/source-identity verification remains valuable, but it is tracked separately in #691 and does not block the bounded MVP while every dependent product claim remains fail-closed.

## Evidence tiers

| Evidence area | MVP status | Accepted meaning |
| --- | --- | --- |
| `ENDPOINT_TRANSPORT` | `VERIFIED` | Permitted transport evidence verifies the current official host, list/detail paths, POST methods, and the detail query key `id`. |
| `FRONTEND_CONTRACT` | `VERIFIED_FROM_SAVED_OFFICIAL_FRONTEND` | Operator-supplied saved official frontend pages/static resources verify the current request models, frontend reads of `data.list` / `data.total`, current list record fields used by the UI, and detail fields read by the shared detail component. |
| `UI_BEHAVIOR` | `VERIFIED_FROM_AUTHENTICATED_ORDINARY_UI` | Authorized ordinary-browser observations verify the current visible registration-number, party/role, row-to-detail, visible-window, date-picker, and ordering behavior recorded in the Phase 3 runbooks. |
| `LIST_DETAIL_ROUTING` | `FRONTEND_VERIFIED` | The saved official frontend routes registration examination and opposition records with `adjuOpenId`, review records with `pubId`, and calls the corresponding `queryInfo?id=...` detail endpoint. |
| `RAW_RESPONSE_SCHEMA` | `UNVERIFIED` | No permitted authenticated raw response body has been captured to prove the live backend envelope/field values independently of the frontend implementation. |
| `BACKEND_TOTAL_SEMANTICS` | `UNVERIFIED` | `data.total` is a frontend-consumed field, but its live backend meaning beyond the visible UI behavior is not established. |
| `BACKEND_HARD_CAP` | `UNVERIFIED` | The UI visibly caps at 100 rows / 10 pages, but this does not prove the backend population or API itself is hard-capped at 100. |

`CNIPA_JUDGMENT_SCHEMA_STATUS` therefore remains `OPERATOR_SUPPLIED_UNVERIFIED`. This closeout policy does not rename that status to `VERIFIED` and does not treat saved frontend code as authenticated raw backend response evidence.

## Accepted MVP facts

The following facts may be used by the bounded MVP at the evidence tier stated above:

- official host/path/method and detail `id` transport facts recorded by the permitted transport evidence;
- current saved official frontend request models and the frontend's current reads of `data.list` and `data.total`;
- registration-examination and opposition list-to-detail routing through `adjuOpenId`;
- review-adjudication list-to-detail routing through `pubId`;
- current shared detail rendering fields, including `title`, `source`, `sendNoStr`, `fileContent`, and `returnDate`;
- a real registration-number query visibly returning matching results across the three judgment libraries;
- visible row-to-detail correspondence in all three libraries;
- a real party-name query visibly returning matching names and UI role labels;
- saturated ordinary-UI result sets exposing exactly 100 visible rows / 10 pages with no page-11 control;
- one-calendar-day windows still being capable of saturating at the same 100-row visible ceiling;
- visible newest-first ordering in the observed result sets;
- the ordinary UI preventing selection of a date span longer than 30 days.

The Phase 3 and manual-observation runbooks remain the detailed evidence ledgers for those observations.

## Explicit non-claims

The MVP must not claim any of the following until #691 is satisfied by a legitimate permitted authenticated raw/source-response channel:

- that the current backend response necessarily conforms to the saved frontend's expected JSON schema;
- that `adjuOpenId` or `pubId` has been independently proven as a backend-stable or legally canonical source identifier;
- that a raw list-record identifier has been observed in an authenticated response and bound to the same value in a corresponding detail request;
- that `data.total` is the uncapped population total;
- that page 11 or other unexposed server-side pagination is unavailable at the backend;
- that the backend itself has a hard 100-result cap;
- that the UI's 30-day date-picker restriction is an independently verified backend constraint;
- that a CDN/network-layer 403 establishes authenticated application-layer 403 semantics;
- that a date-window or target lookup proves exhaustive CNIPA population coverage;
- that any acquisition mode has population coverage `COMPLETE`.

## Product-safe closeout semantics

### `DATE_RECENCY_DISCOVERY`

This remains a bounded fresh-signal/sample feed. Its current coverage ceiling is `PARTIAL`.

- visible saturation/truncation must remain explicit;
- one-day partitioning does not justify completeness because a single day may still saturate at 100;
- consumers must not interpret the result as all judgments issued during the window;
- population `COMPLETE` claims remain forbidden.

### `REGISTRATION_NUMBER_TARGETED`

This remains bounded follow-up for a registration/application number already known from an authorized upstream source or workflow.

- do not enumerate registration-number ranges;
- a targeted request is a reason to check source evidence, not legal truth by itself;
- source identity remains provenance-scoped and based on the current frontend-verified route until #691 independently verifies backend list/detail identity semantics;
- population `COMPLETE` claims remain forbidden.

### `PARTY_NAME`

The query shape remains modeled, but this closeout does not create a production acquisition intent for it and does not enable a new live request path.

## Runtime and failure boundary

This closeout is an evidence-policy decision only. It does not enable a new CNIPA request mode, change authentication behavior, expand browser automation, weaken pacing/request bounds, or modify collection transport.

If actual runtime evidence conflicts with the frontend-verified expectations, acquisition must fail closed through the existing CNIPA error/schema boundary rather than inventing field semantics or silently promoting coverage.

## Security boundary

The inability to obtain raw response bodies through ordinary browser developer tools does not authorize bypass or evasion. Do not use any of the following to satisfy #573 or #691:

- CAPTCHA or SSO bypass;
- disabling, patching, or evading site anti-debugging protections;
- remote-debug attachment to an authenticated browser;
- authenticated userscript/bookmarklet request injection;
- cookie, token, authorization-header, storage-state, or browser-profile extraction/replay;
- proxy/MITM capture of authenticated browser traffic;
- HAR-with-content or other credential-bearing evidence retention.

A future #691 promotion requires a legitimate permitted raw/source-response channel that can preserve sanitized response evidence without exposing session credentials.

## Relationship to existing runbooks

- `docs/operations/CNIPA_PHASE3_LIVE_ACCEPTANCE.md` records the Phase 3 live/manual acceptance history and raw-response evidence boundary.
- `docs/operations/CNIPA_MANUAL_UI_OBSERVATION.md` records the ordinary authenticated UI observation procedure and accepted UI facts.
- `docs/operations/CNIPA_ACQUISITION_INTENTS.md` remains authoritative for the distinction between `DATE_RECENCY_DISCOVERY` and `REGISTRATION_NUMBER_TARGETED` and their coverage semantics.
- #691 owns future backend raw-response/schema/source-identity/total/cap promotion.

Where older #573 text says page 11 / greater-than-100 behavior is `NOT_TESTED`, this document and the later Phase 3 visible-window observations supersede that wording: the ordinary UI is verified to expose at most 100 visible rows / 10 pages with no page-11 control, while backend hard-cap semantics remain `UNVERIFIED`.

## #573 MVP closeout acceptance

#573 may close as completed when all of the following are true:

1. deterministic CNIPA query/document contracts, provenance, failure semantics, and synthetic CI coverage are merged;
2. the operator-assisted authenticated runtime and bounded execution controls are merged without CAPTCHA/SSO bypass;
3. the manual-only Phase 3 harness and evidence-review boundary are merged;
4. permitted transport evidence and saved official frontend evidence establish the current transport/frontend contract tiers above;
5. ordinary authenticated UI observations establish the current UI-behavior tier above;
6. acquisition intents and fail-closed coverage semantics remain frozen as `PARTIAL`/`UNKNOWN` as applicable, with population `COMPLETE` forbidden;
7. backend raw-response/schema/source-identity/total/cap facts remain explicitly unverified rather than inferred;
8. the remaining backend-only evidence debt is tracked in #691.

Closing #573 under this policy means the **bounded MVP is accepted with explicit evidence limits**. It does not mean the CNIPA backend contract, backend hard cap, or exhaustive population coverage has been verified.
