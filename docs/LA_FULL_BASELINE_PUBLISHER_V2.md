# Lao WoPublish full-baseline V2 publisher — default-off contract

The existing Knowledge V1 publisher remains unchanged for the verified two-page
plus LA55159 pilot. The V2 Data Engine receiver merged in DE #854 allows
FULL_INDEX_PAGE and FULL_DETAIL only after a reviewed UInt16 page-index
migration and a separate operator feature switch; neither was activated here.

This change adds a second independent, default-off publisher-side switch:
MARKORBIT_LA_FULL_BASELINE_PUBLISH_ENABLED=true. It applies only to a
global-trademark-publisher Worker with a configured Data Engine admission
URL/key. The WoPublish crawler Worker cannot enable that setting and never
writes Data Engine directly. V1 requests continue to work when the switch is
off.

A V2 publisher requires a real Knowledge RawArtifact with schemaVersion
GLOBAL_TRADEMARK_FACT_ADMISSION_REQUEST_V2, an exact immutable artifact ID,
SHA-256, canonical URI and byte length in the governed Job, an active authenticated
Worker lease and the control plane's cross-Source read grant. The request must
set fullCollectionAuthorized=true with contract_version
GLOBAL_TRADEMARK_STRUCTURED_ADMISSION_V2 and target the one exact Global Hot
fact-admission path. The Job schedule must be MANUAL.
The publisher validates V2 source-total bounds, official pagination and
source response identity before any Data Engine call. It verifies V2 response
contract, storage_placement=hot_global, no legal currentness, record counts,
page/response/evidence digests and the exact source_total echo. It persists a
receipt with the original immutable RawArtifact ID as its parent. V1 cannot
upgrade itself to fullCollectionAuthorized=true.

Operator gates remain in force: #903 must produce actual authenticated
50+50+1 pilot RawArtifacts and owner receipts; a reviewed #907 manual full
Work must freeze true source IDs with per-page durable evidence and a bounded
request/429/byte budget; owner V2 needs its separate schema/flag gates. This
change does not add full index acquisition to the existing pilot-only Job,
fabricate official IDs, generate a completion receipt, or schedule a crawler.
Current Knowledge Core authentication and Worker enrollment must be resolved
without impersonation or credential bypass.
