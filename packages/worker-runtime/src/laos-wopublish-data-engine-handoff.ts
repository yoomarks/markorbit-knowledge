import type { AcquiredCollectionArtifact } from "./artifact-backed-collection-executor";
import { LAOS_SOURCE_ID, laosSha256, type LaosObservation } from "./laos-wopublish-source-adapter";

export const LAOS_GLOBAL_ADMISSION_CONTRACT = "GLOBAL_TRADEMARK_STRUCTURED_ADMISSION_V1";
export const LAOS_GLOBAL_MAPPING_VERSION = "GLOBAL_TRADEMARK_NORMALIZED_V1";
export const LAOS_GLOBAL_ADMISSION_PATH = "/api/admin/v2/fact-admissions/global/observations";
export const LAOS_ADMISSION_REQUEST_SCHEMA = "LA_WOPUBLISH_FACT_ADMISSION_REQUEST_V1";
const encoder = new TextEncoder();

function normalizedDate(value: string): string {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!match) throw new Error("WoPublish filing date format changed");
  const normalized = [match[3], match[2], match[1]].join("-");
  const date = new Date(normalized + "T00:00:00.000Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw new Error("WoPublish filing date is not a calendar date");
  }
  return normalized;
}

/** Admission intent is durable Knowledge evidence, NEVER an inline network dispatch. */
export function buildLaosDataEngineAdmissionRequest(input: {
  observation: LaosObservation;
  evidenceCanonicalUri: string;
  projectionCanonicalUri: string;
}): AcquiredCollectionArtifact {
  const { observation } = input;
  const scope =
    observation.kind === "PAGE" ? "list/page/" + observation.page : "detail/" + observation.id;
  const records =
    observation.kind === "PAGE"
      ? observation.ids.map((id) => ({
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
        }))
      : [
          {
            source_record_id: observation.id,
            // WoPublish's LA id is a source locator; legal application/registration
            // numbers remain null unless independently evidenced.
            application_number: null,
            registration_number: observation.registrationNumber,
            mark_text: observation.markText || null,
            source_status_raw: observation.status,
            normalized_status: null,
            applicant_name: observation.applicant,
            nice_classes: observation.niceClasses,
            filing_date: normalizedDate(observation.filingDate),
            logo_url: observation.logoUrl,
            source_language: "lo",
            source_native_fields: { filing_date_source: observation.filingDate },
          },
        ];
  const payload = {
    contract_version: LAOS_GLOBAL_ADMISSION_CONTRACT,
    mapping_version: LAOS_GLOBAL_MAPPING_VERSION,
    source_owner: "MARKORBIT_KNOWLEDGE",
    jurisdiction: "LA",
    source_id: LAOS_SOURCE_ID,
    observation_kind: observation.kind === "PAGE" ? "LIST_PAGE" : "DETAIL",
    page_index: observation.kind === "PAGE" ? observation.page : 0,
    source_uri: observation.sourceUri,
    evidence_canonical_uri: input.evidenceCanonicalUri,
    evidence_sha256: laosSha256(observation.redactedBody),
    source_response_sha256: observation.rawSha256,
    observed_at: observation.observedAt,
    records,
  };
  const request = {
    schemaVersion: LAOS_ADMISSION_REQUEST_SCHEMA,
    method: "POST",
    path: LAOS_GLOBAL_ADMISSION_PATH,
    status: "PREPARED_NOT_DISPATCHED",
    fullCollectionAuthorized: false,
    evidenceCanonicalUri: input.evidenceCanonicalUri,
    payload,
  };
  return {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName: "la-wopublish-" + scope.replaceAll("/", "-") + "-fact-admission-request.json",
    canonicalUri: "la-dipo://wopublish/trademarks/" + scope + "/fact-admission-request",
    sourceUri: observation.sourceUri,
    parentCanonicalUris: [input.projectionCanonicalUri],
    content: encoder.encode(JSON.stringify(request)),
  };
}
