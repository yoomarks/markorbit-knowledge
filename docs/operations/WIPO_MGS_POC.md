# WIPO MGS collection PoC

Status: implementation available, external execution disabled

Connector: `wipo-mgs-worker@0.1.0`

Coverage target: `wo-wipo-madrid-goods-services-manager` (`WATCH`)

Source type: `API`
Job type: `API_COLLECTION`

## Boundary and authorization

The Madrid Goods & Services Manager is an official WIPO public application. On 2026-10-09 its
public page exposed a language registry and identified the displayed Nice edition, but the observed
`process.jsp` data path was not documented as a public bulk API. WIPO's general terms did not, by
themselves, establish permission for bulk automated extraction.

This PoC therefore does not change the M13 prohibition on harvesting undocumented application
APIs. It supplies an offline-tested, source-specific implementation so an approved collection can
use the governed Knowledge execution path later. The coverage target remains `WATCH`; no Source,
CollectionPlan, schedule, Worker credential, or live POST request is created by this change.

External execution requires both:

1. documented authorization for the intended automated access volume and purpose; and
2. `MARKORBIT_WIPO_MGS_AUTOMATED_ACCESS_APPROVED=true` on the dedicated Worker.

Both Worker startup and acquisition fail closed without that flag. Operators must not set it merely
because this code exists.

`WIPO_MGS_CONNECTOR_MANIFEST` is supplied as a valid `DISABLED` registration template. Changing its
operational status, registering a Source, or creating a plan remains an explicit post-authorization
operator decision.

## Observed request contract

The connector is fixed to one HTTPS endpoint and one bounded language/class unit per Job:

```text
POST https://webaccess.wipo.int/mgs/process.jsp
Content-Type: application/x-www-form-urlencoded; charset=UTF-8

action=load&lang={requestLanguage}&class={niceClass}
```

The public page's `languageOptions` registry is the source of truth for locale-to-request mappings.
The observed exceptions include `ja → jp`, `ko → kr`, and `pt-BR → br`; callers must not infer that
the locale code always equals the request code.

The connector does not follow redirects, use cookies, send credentials, run browser automation, or
retry internally. It resolves the fixed host before connection, rejects any non-public DNS answer,
preserves TLS SNI and `Host`, and bounds timeout and response size. The existing Job ledger owns
retry decisions.

HTTP `403` and `429` pause collection as non-retryable access restrictions requiring operator
review. `408`, `425`, transport failures, and `5xx` responses may be retried only through the normal
Job policy. HTML challenges, invalid UTF-8, malformed JSON, empty arrays, language/class mismatch,
and duplicate source IDs are rejected.

## Evidence and normalization

Each successful source Job emits four lineage-linked JSON RawArtifacts:

- the response bytes exactly as received;
- a deterministic normalized snapshot;
- a prepared, not-dispatched Data Engine admission request; and
- a deterministic collection report with hashes, record count, source version when observed, and
  anomalies.

Every source row preserves `id`, `cls`, `lng`, `seq`, `src`, `txt`, `acc`, `rej`, `prf`, and unknown
future fields in `rawPayload`. Normalization adds a content hash and parsed jurisdiction statuses
without replacing the raw values. Missing `rej` means no explicit rejection evidence; it must not
be interpreted as universal acceptance. A jurisdiction appearing in both `acc` and `rej` is retained
as `conflict` rather than silently resolved.

Multilingual association uses `(sourceTermId, Nice class)` and stores only localized rows actually
returned by WIPO. The implementation never machine-translates or fills missing languages. Reuse of
one source ID across multiple Nice classes is reported as an anomaly.

Historical PoC counts (`zh/1=2244`, `en/1=3605`, `en/2=766`, `ar/1=722`) are comparison signals,
not completeness requirements. Count drift creates an anomaly and does not automatically reject a
valid smaller-language response. Snapshot diffing distinguishes added, changed, unchanged, and
not-observed rows; “not observed” is not a deletion claim.

## Knowledge / Data Engine ownership boundary

Knowledge owns source access, Job governance, raw response retention, deterministic normalization,
the immutable admission request, and the resulting delivery receipt. It does **not** create MGS
domain tables or expose MGS term search from the Knowledge SQLite registry.

The normalized structured corpus is owned by Data Engine. The source Job prepares
`WIPO_MGS_FACT_ADMISSION_REQUEST_V1` at the fixed endpoint
`/api/admin/v2/fact-admissions/reference/wipo-mgs/snapshots`. A separate
`wipo-mgs-publisher` Worker reads only the exact durable request authorized by its immutable Job,
verifies its canonical URI, SHA-256 and size, then submits it with the dedicated Data Engine
fact-admission credential. The source Worker receives no Data Engine credential; the publisher
receives no WIPO network authority.

Data Engine validates the source scope and lineage again and stores append-only localized term
observations in `markorbit_facts.wipo_mgs_term_observation` on the `hot_global_only` policy. The
storage key preserves source term ID, Nice class, language, response hash, content hash, raw source
fields, parsed acceptance/rejection sets and jurisdiction statuses. Admission is idempotent by the
exact source snapshot and rejects an older conflicting snapshot from becoming the latest scope.
Data Engine serves bounded current-snapshot search at `/api/v1/reference/wipo-mgs/terms` and
multilingual detail at `/api/v1/reference/wipo-mgs/terms/{source_term_id}`. Acceptance filters are
evaluated against the preserved language-specific sets. These reads never use a Knowledge
persistence shortcut.

## Activation checklist

After authorization is recorded, an operator may create a dedicated API Source whose immutable
Job snapshot includes only:

```json
{
  "requestLanguage": "en",
  "localeCode": "en",
  "niceClass": 1,
  "sourceVersion": "NCL13-2026"
}
```

`sourceVersion` must be omitted when it was not observed on the public application. Use connector
`wipo-mgs-worker@0.1.0`, authorize JSON output, dispatch one manual canary Job, inspect all four
RawArtifacts, and verify the access logs before increasing scope. After the request artifact is
durable, create a separate manual publisher Job using
`wipo-mgs-fact-admission-publisher@1.0.0`, source
`markorbit://knowledge/wipo-mgs/fact-admission-requests`, and an exact immutable request-artifact
reference. Run that Worker with `MARKORBIT_COLLECTION_PROVIDER=wipo-mgs-publisher`,
`MARKORBIT_DATA_ENGINE_URL`, and `MARKORBIT_DATA_ENGINE_FACT_ADMISSION_KEY`. Confirm the durable
receipt proves `storage_placement=hot_global`. Do not create a recurring schedule until the canary,
rate limit, retention, Data Engine schema activation, and authorization review are accepted.

The tests use labeled representative synthetic responses. They are not evidence of a live WIPO
acquisition, and no user HAR or captured production response is committed.
