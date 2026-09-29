import type { AcquiredCollectionArtifact } from "./artifact-backed-collection-executor";
import {
  GLOBAL_TRADEMARK_FULL_BASELINE_CONTRACT,
  GLOBAL_TRADEMARK_FULL_BASELINE_REQUEST_SCHEMA,
} from "./global-trademark-fact-admission-job-acquirer";
import {
  buildLaosDataEngineAdmissionRequest,
  LAOS_GLOBAL_ADMISSION_PATH,
} from "./laos-wopublish-data-engine-handoff";
import {
  LAOS_ORIGIN,
  LAOS_SOURCE_ID,
  laosSha256,
  type LaosDetail,
} from "./laos-wopublish-source-adapter";

export const LAOS_FULL_DETAIL_PROJECTION_SCHEMA = "LA_WOPUBLISH_FULL_DETAIL_PROJECTION_V1";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const idPattern = /^LA\d{3,10}$/u;
const shaPattern = /^[a-f0-9]{64}$/u;

function fail(message: string): never {
  throw new TypeError(message);
}
function jsonArtifact(
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
    parentCanonicalUris,
    content: encoder.encode(JSON.stringify(value)),
  };
}

function assertDetail(detail: LaosDetail): void {
  const expectedSource = LAOS_ORIGIN + "/wopublish-search/public/detail/trademarks?id=" + detail.id;
  if (
    detail.kind !== "DETAIL" ||
    !idPattern.test(detail.id) ||
    detail.sourceUri !== expectedSource ||
    !detail.redactedBody.length ||
    !detail.mime.toLowerCase().includes("html") ||
    !shaPattern.test(detail.rawSha256) ||
    Number.isNaN(Date.parse(detail.observedAt))
  ) {
    fail("Full detail must be an exact official WoPublish observation");
  }
  const redacted = decoder.decode(detail.redactedBody);
  if (
    /;jsessionid=(?!\[REDACTED\])/iu.test(redacted) ||
    /(?:[?&](?:psusr|csrf|token)=)(?!\[REDACTED\])/iu.test(redacted)
  ) {
    fail("Session-bearing WoPublish detail bytes cannot become durable evidence");
  }
  if (detail.logoBytes && (!detail.logoMime || !detail.logoUrl)) {
    fail("Captured logo bytes require source URL and MIME evidence");
  }
  if (!detail.logoBytes && detail.logoMime) {
    fail("Logo MIME cannot exist without captured source bytes");
  }
  if (detail.logoUrl) {
    const url = new URL(detail.logoUrl);
    if (
      url.origin !== LAOS_ORIGIN ||
      url.pathname !== "/wopublish-search/service/trademarks/application/" + detail.id + "/logo"
    ) {
      fail("Logo URL must stay on the matching official WoPublish record");
    }
  }
}

function v2Request(
  detail: LaosDetail,
  rawUri: string,
  projectionUri: string,
): AcquiredCollectionArtifact {
  const v1 = buildLaosDataEngineAdmissionRequest({
    observation: detail,
    evidenceCanonicalUri: rawUri,
    projectionCanonicalUri: projectionUri,
  });
  const root = JSON.parse(decoder.decode(v1.content)) as {
    schemaVersion: string;
    fullCollectionAuthorized: boolean;
    path: string;
    payload: Record<string, unknown>;
  };
  if (
    root.path !== LAOS_GLOBAL_ADMISSION_PATH ||
    root.payload.observation_kind !== "DETAIL" ||
    root.payload.page_index !== 0 ||
    "source_total" in root.payload
  ) {
    fail("Pilot detail mapper no longer matches the V2 upgrade boundary");
  }
  root.schemaVersion = GLOBAL_TRADEMARK_FULL_BASELINE_REQUEST_SCHEMA;
  root.fullCollectionAuthorized = true;
  root.payload.contract_version = GLOBAL_TRADEMARK_FULL_BASELINE_CONTRACT;
  root.payload.observation_kind = "FULL_DETAIL";
  return {
    ...v1,
    originalName: "la-wopublish-" + detail.id + "-full-detail-fact-admission-request.json",
    content: encoder.encode(JSON.stringify(root)),
  };
}

export function buildLaosFullDetailArtifacts(
  detail: LaosDetail,
): readonly AcquiredCollectionArtifact[] {
  assertDetail(detail);
  const base = "la-dipo://wopublish/trademarks/detail/" + detail.id;
  const rawUri = base + "/redacted-response";
  const projectionUri = base + "/source-projection";
  const raw: AcquiredCollectionArtifact = {
    artifactKind: "HTML",
    mimeType: detail.mime,
    originalName: "la-wopublish-" + detail.id + ".html",
    sourceUri: detail.sourceUri,
    canonicalUri: rawUri,
    content: detail.redactedBody,
  };
  const projection = jsonArtifact(
    "la-wopublish-" + detail.id + "-full-detail.json",
    projectionUri,
    detail.sourceUri,
    [rawUri],
    {
      schemaVersion: LAOS_FULL_DETAIL_PROJECTION_SCHEMA,
      sourceOwner: "MARKORBIT_KNOWLEDGE",
      sourceId: LAOS_SOURCE_ID,
      sourceRecordId: detail.id,
      sourceRecordIdKind: "WOPUBLISH_RECORD_ID_NOT_LEGAL_REGISTRATION_NUMBER",
      evidenceStatus: "UNVERIFIED_OFFICIAL_SOURCE_OBSERVATION",
      markText: detail.markText,
      status: detail.status,
      filingDate: detail.filingDate,
      applicant: detail.applicant,
      niceClasses: detail.niceClasses,
      registrationNumber: detail.registrationNumber,
      logoUrl: detail.logoUrl,
      logoEvidence: detail.logoBytes ? "SOURCE_IMAGE_BYTES_CAPTURED" : "NO_IMAGE_CAPTURED",
      sourceResponseSha256: detail.rawSha256,
      redactedResponseSha256: laosSha256(detail.redactedBody),
      observedAt: detail.observedAt,
    },
  );
  const artifacts: AcquiredCollectionArtifact[] = [raw, projection];
  if (detail.logoBytes && detail.logoMime && detail.logoUrl) {
    artifacts.push({
      artifactKind: "IMAGE",
      mimeType: detail.logoMime,
      originalName: "la-wopublish-" + detail.id + "-logo",
      sourceUri: detail.logoUrl,
      canonicalUri: base + "/logo",
      parentCanonicalUris: [rawUri],
      content: detail.logoBytes,
    });
  }
  artifacts.push(v2Request(detail, rawUri, projectionUri));
  return Object.freeze(artifacts);
}
