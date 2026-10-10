import { isWipoMgsSnapshot, type WipoMgsSnapshot } from "@markorbit/contracts";
import type { AcquiredCollectionArtifact } from "./artifact-backed-collection-executor";
import { canonicalWipoMgsJson } from "./wipo-source-adapter";

export const WIPO_MGS_ADMISSION_CONTRACT = "WIPO_MGS_STRUCTURED_ADMISSION_V1";
export const WIPO_MGS_MAPPING_VERSION = "WIPO_MGS_NORMALIZED_V1";
export const WIPO_MGS_ADMISSION_PATH = "/api/admin/v2/fact-admissions/reference/wipo-mgs/snapshots";
export const WIPO_MGS_ADMISSION_REQUEST_SCHEMA = "WIPO_MGS_FACT_ADMISSION_REQUEST_V1";

function observedAt(value: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new Error("WIPO MGS admission observedAt must be an ISO-8601 instant");
  }
  return value;
}

/** Durable Knowledge evidence only. Dispatch belongs to a separately credentialed publisher Job. */
export function buildWipoMgsDataEngineAdmissionRequest(input: {
  snapshot: WipoMgsSnapshot;
  observedAt: string;
  sourceUri: string;
  evidenceCanonicalUri: string;
  projectionCanonicalUri: string;
}): AcquiredCollectionArtifact {
  if (!isWipoMgsSnapshot(input.snapshot)) {
    throw new Error("WIPO MGS admission requires a valid normalized snapshot");
  }
  const timestamp = observedAt(input.observedAt);
  const payload = {
    contract_version: WIPO_MGS_ADMISSION_CONTRACT,
    mapping_version: WIPO_MGS_MAPPING_VERSION,
    source_owner: "MARKORBIT_KNOWLEDGE",
    source_id: input.snapshot.source,
    source_uri: input.sourceUri,
    evidence_canonical_uri: input.evidenceCanonicalUri,
    evidence_sha256: input.snapshot.responseSha256,
    observed_at: timestamp,
    snapshot: input.snapshot,
  };
  const request = {
    schemaVersion: WIPO_MGS_ADMISSION_REQUEST_SCHEMA,
    method: "POST",
    path: WIPO_MGS_ADMISSION_PATH,
    status: "PREPARED_NOT_DISPATCHED",
    evidenceCanonicalUri: input.evidenceCanonicalUri,
    payload,
  };
  const suffix = `${input.snapshot.requestLanguage}-${String(input.snapshot.niceClass).padStart(2, "0")}`;
  return {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName: `wipo-mgs-${suffix}-fact-admission-request.json`,
    sourceUri: input.sourceUri,
    canonicalUri: input.projectionCanonicalUri.replace(/\/normalized$/u, "/fact-admission-request"),
    parentCanonicalUris: [input.evidenceCanonicalUri, input.projectionCanonicalUri],
    content: new TextEncoder().encode(canonicalWipoMgsJson(request)),
  };
}
