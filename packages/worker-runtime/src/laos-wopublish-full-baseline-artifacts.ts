import type { AcquiredCollectionArtifact } from "./artifact-backed-collection-executor";
import { CollectionAcquisitionError } from "./artifact-backed-collection-executor";
import {
  GLOBAL_TRADEMARK_FULL_BASELINE_CONTRACT,
  GLOBAL_TRADEMARK_FULL_BASELINE_REQUEST_SCHEMA,
} from "./global-trademark-fact-admission-job-acquirer";
import {
  LAOS_GLOBAL_ADMISSION_PATH,
  LAOS_GLOBAL_MAPPING_VERSION,
} from "./laos-wopublish-data-engine-handoff";
import {
  LAOS_LIST_URL,
  LAOS_SOURCE_ID,
  laosSha256,
  type LaosIndexPage,
} from "./laos-wopublish-source-adapter";

export const LAOS_FULL_INDEX_PROJECTION_SCHEMA = "LA_WOPUBLISH_FULL_INDEX_PAGE_PROJECTION_V1";
export const LAOS_FULL_INDEX_CHECKPOINT_SCHEMA = "LA_WOPUBLISH_FULL_INDEX_CHECKPOINT_V1";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const idPattern = /^LA(?:M)?\d{3,10}$/u;
const shaPattern = /^[a-f0-9]{64}$/u;
function fail(message: string): never {
  throw new CollectionAcquisitionError("LA_FULL_INDEX_EVIDENCE_INVALID", message, false);
}
function evidenceArtifact(
  name: string,
  canonicalUri: string,
  sourceUri: string,
  parentCanonicalUris: string[],
  value: unknown,
): AcquiredCollectionArtifact {
  return {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName: name,
    canonicalUri,
    sourceUri,
    ...(parentCanonicalUris.length ? { parentCanonicalUris } : {}),
    content: encoder.encode(JSON.stringify(value)),
  };
}
/**
 * Produce exactly one page of independently durable source/projection/checkpoint/
 * prepared V2 request evidence. The existing authenticated Worker executor must
 * finalize this entire page before calling the source stream for the next page.
 * This pure mapper performs no network I/O and never posts to Data Engine.
 */
export function buildLaosFullIndexPageArtifacts(
  page: LaosIndexPage,
): readonly AcquiredCollectionArtifact[] {
  if (
    page.kind !== "PAGE" ||
    page.sourceUri !== LAOS_LIST_URL ||
    !Number.isSafeInteger(page.total) ||
    page.total <= 100 ||
    page.total > 100_000 ||
    !Number.isSafeInteger(page.page) ||
    page.page < 1 ||
    page.page > Math.ceil(page.total / 50) ||
    page.ids.length !== Math.min(50, page.total - (page.page - 1) * 50) ||
    page.ids.some((id) => !idPattern.test(id)) ||
    new Set(page.ids).size !== page.ids.length ||
    !shaPattern.test(page.rawSha256) ||
    !shaPattern.test(page.firstPageIdsSha256) ||
    !shaPattern.test(page.sourceRecordIdsSha256) ||
    page.sourceRecordIdsSha256 !== laosSha256(encoder.encode(page.ids.join("\n"))) ||
    (page.page === 1 && page.firstPageIdsSha256 !== page.sourceRecordIdsSha256) ||
    !page.redactedBody.length ||
    Number.isNaN(Date.parse(page.observedAt)) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/u.test(page.observedAt) ||
    (page.page === 1
      ? !page.mime.toLowerCase().includes("html")
      : !/^(?:text|application)\/xml\b/iu.test(page.mime))
  ) {
    fail("Full index page must be a bounded, distinct, exact-digest official observation");
  }
  const redacted = decoder.decode(page.redactedBody);
  if (
    /;jsessionid=(?!\[REDACTED\])/iu.test(redacted) ||
    /(?:[?&](?:psusr|csrf|token)=)(?!\[REDACTED\])/iu.test(redacted)
  ) {
    fail("Session-bearing WoPublish bytes cannot become a durable RawArtifact");
  }
  const base = "la-dipo://wopublish/trademarks/list/page/" + page.page;
  const rawUri = base + "/redacted-response";
  const projectionUri = base + "/source-id-projection";
  const checkpointUri = base + "/resume-checkpoint";
  const sourceResponseSha = page.rawSha256;
  const evidenceSha = laosSha256(page.redactedBody);
  const idsSha = page.sourceRecordIdsSha256;
  const raw: AcquiredCollectionArtifact = {
    artifactKind: page.page === 1 ? "HTML" : "XML",
    mimeType: page.mime,
    originalName: "la-wopublish-full-page-" + page.page + (page.page === 1 ? ".html" : ".xml"),
    canonicalUri: rawUri,
    sourceUri: page.sourceUri,
    content: page.redactedBody,
  };
  const projection = evidenceArtifact(
    "la-wopublish-full-page-" + page.page + "-ids.json",
    projectionUri,
    page.sourceUri,
    [rawUri],
    {
      schemaVersion: LAOS_FULL_INDEX_PROJECTION_SCHEMA,
      sourceOwner: "MARKORBIT_KNOWLEDGE",
      sourceId: LAOS_SOURCE_ID,
      evidenceStatus: "UNVERIFIED_OFFICIAL_SOURCE_OBSERVATION",
      sourceRecordIdKind: "WOPUBLISH_RECORD_ID_NOT_LEGAL_REGISTRATION_NUMBER",
      page: page.page,
      pageSize: 50,
      sourceTotal: page.total,
      sourceRecordIds: page.ids,
      sourceRecordIdsSha256: idsSha,
      firstPageIdsSha256: page.firstPageIdsSha256,
      sourceResponseSha256: sourceResponseSha,
      redactedResponseSha256: evidenceSha,
      observedAt: page.observedAt,
    },
  );
  const checkpoint = evidenceArtifact(
    "la-wopublish-full-page-" + page.page + "-checkpoint.json",
    checkpointUri,
    page.sourceUri,
    [base + "/fact-admission-request"],
    {
      schemaVersion: LAOS_FULL_INDEX_CHECKPOINT_SCHEMA,
      sourceId: LAOS_SOURCE_ID,
      completedPage: page.page,
      sourceTotal: page.total,
      sourceRecordIdsSha256: idsSha,
      firstPageIdsSha256: page.firstPageIdsSha256,
      lastSourceRecordId: page.ids.at(-1),
      nextPage: page.page * 50 < page.total ? page.page + 1 : null,
      sourceResponseSha256: sourceResponseSha,
      observedAt: page.observedAt,
      // Per-page checkpoint only: never claims full-corpus or legal-current coverage.
      fullBaselineCompleted: false,
    },
  );
  const payload = {
    contract_version: GLOBAL_TRADEMARK_FULL_BASELINE_CONTRACT,
    mapping_version: LAOS_GLOBAL_MAPPING_VERSION,
    source_owner: "MARKORBIT_KNOWLEDGE",
    jurisdiction: "LA",
    source_id: LAOS_SOURCE_ID,
    observation_kind: "FULL_INDEX_PAGE",
    page_index: page.page,
    source_total: page.total,
    source_uri: page.sourceUri,
    evidence_canonical_uri: rawUri,
    evidence_sha256: evidenceSha,
    source_response_sha256: sourceResponseSha,
    observed_at: page.observedAt,
    records: page.ids.map((id) => ({
      source_record_id: id,
      application_number: null,
      registration_number: null,
      mark_text: null,
      source_status_raw: null,
      normalized_status: null,
      applicant_name: null,
      nice_classes: [],
      filing_date: null,
      logo_url: null,
      source_language: "lo",
      source_native_fields: {},
    })),
  };
  const request = evidenceArtifact(
    "la-wopublish-full-page-" + page.page + "-fact-admission-request.json",
    base + "/fact-admission-request",
    page.sourceUri,
    [projectionUri],
    {
      schemaVersion: GLOBAL_TRADEMARK_FULL_BASELINE_REQUEST_SCHEMA,
      method: "POST",
      path: LAOS_GLOBAL_ADMISSION_PATH,
      status: "PREPARED_NOT_DISPATCHED",
      fullCollectionAuthorized: true,
      evidenceCanonicalUri: rawUri,
      payload,
    },
  );
  return [raw, projection, checkpoint, request];
}
