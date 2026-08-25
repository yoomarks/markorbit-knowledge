import { createHash } from "node:crypto";
import {
  CASE_DOSSIER_OBJECT_TYPE,
  CASE_DOSSIER_PROTOCOL_VERSION,
  isCaseCandidateV1,
  isCaseDossierV1,
  isCaseEvidenceCollectionV1,
  type CaseCandidateV1,
  type CaseDossierDocumentV1,
  type CaseDossierEvidenceRefV1,
  type CaseDossierNarrativeStatementV1,
  type CaseDossierTimelineEventV1,
  type CaseDossierV1,
  type CaseEvidenceCollectionV1,
  type ExactCaseSourcePayloadV1,
} from "@markorbit/contracts";

export class CaseDossierAssemblyError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CaseDossierAssemblyError";
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function timestamp(value: unknown): value is string {
  return nonEmpty(value) && !Number.isNaN(Date.parse(value));
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sameVersion(left: unknown, right: number): boolean {
  return String(left) === String(right);
}

function parseExactPayload(
  payload: ExactCaseSourcePayloadV1,
  label: string,
): Record<string, unknown> {
  let bytes: Buffer;
  try {
    bytes = Buffer.from(payload.dataBase64, "base64");
  } catch (cause) {
    throw new CaseDossierAssemblyError(
      "CASE_DOSSIER_EVIDENCE_INVALID",
      `${label} payload is not valid base64`,
      cause instanceof Error ? { cause } : undefined,
    );
  }
  if (bytes.byteLength !== payload.sizeBytes || sha256(bytes) !== payload.sha256) {
    throw new CaseDossierAssemblyError(
      "CASE_DOSSIER_EVIDENCE_IDENTITY_MISMATCH",
      `${label} payload does not match its recorded byte identity`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (cause) {
    throw new CaseDossierAssemblyError(
      "CASE_DOSSIER_EVIDENCE_INVALID",
      `${label} payload is not valid JSON`,
      cause instanceof Error ? { cause } : undefined,
    );
  }
  const item = object(parsed);
  if (!item) {
    throw new CaseDossierAssemblyError(
      "CASE_DOSSIER_EVIDENCE_INVALID",
      `${label} payload must be a JSON object`,
    );
  }
  return item;
}

function assertLineage(candidate: CaseCandidateV1, collection: CaseEvidenceCollectionV1): void {
  if (
    collection.candidateId !== candidate.candidateId ||
    collection.sourceMatter.sourceMatterId !== candidate.sourceMatterId ||
    collection.sourceMatter.sourceMatterVersion !== candidate.sourceMatterVersion ||
    collection.sourceMatter.sourceSnapshotSha256 !== candidate.sourceSnapshotSha256 ||
    collection.sourceMatter.sourceRetrievalRef !== candidate.sourceRetrievalRef ||
    collection.sourceMatter.sourceWorkspaceId !== candidate.accessScope.sourceWorkspaceId
  ) {
    throw new CaseDossierAssemblyError(
      "CASE_DOSSIER_SOURCE_LINEAGE_MISMATCH",
      "Case evidence collection does not match the frozen Case Candidate source identity",
    );
  }
}

function evidenceRef(
  collection: CaseEvidenceCollectionV1,
  payload: ExactCaseSourcePayloadV1,
  surface: CaseDossierEvidenceRefV1["surface"],
  documentPackageId?: string,
): CaseDossierEvidenceRefV1 {
  return {
    collectionId: collection.collectionId,
    surface,
    sourceRef: payload.sourceRef,
    sha256: payload.sha256,
    ...(documentPackageId ? { documentPackageId } : {}),
  };
}

function formalMatterResponse(
  collection: CaseEvidenceCollectionV1,
  candidate: CaseCandidateV1,
): { response: Record<string, unknown>; matter: Record<string, unknown> } {
  const response = parseExactPayload(collection.formalMatter, "Formal Matter");
  const matter = object(response.formalMatter);
  if (
    !matter ||
    matter.formalMatterId !== candidate.sourceMatterId ||
    matter.workspaceId !== candidate.accessScope.sourceWorkspaceId ||
    !sameVersion(matter.version, candidate.sourceMatterVersion) ||
    matter.snapshotSha256 !== candidate.sourceSnapshotSha256
  ) {
    throw new CaseDossierAssemblyError(
      "CASE_DOSSIER_FORMAL_MATTER_MISMATCH",
      "Formal Matter payload does not match the frozen Case Candidate identity",
    );
  }
  return { response, matter };
}

function lifecycleResponse(
  collection: CaseEvidenceCollectionV1,
  candidate: CaseCandidateV1,
): Record<string, unknown> | null {
  if (!collection.lifecycleProvenance) return null;
  const response = parseExactPayload(collection.lifecycleProvenance, "Lifecycle provenance");
  if (!Array.isArray(response.events)) {
    throw new CaseDossierAssemblyError(
      "CASE_DOSSIER_LIFECYCLE_INVALID",
      "Lifecycle provenance payload is missing its event list",
    );
  }
  for (const raw of response.events) {
    const event = object(raw);
    if (!event) continue;
    const formalMatter = object(event.formalMatter);
    if (
      event.workspaceId !== candidate.accessScope.sourceWorkspaceId ||
      !formalMatter ||
      formalMatter.id !== candidate.sourceMatterId ||
      !sameVersion(formalMatter.version, candidate.sourceMatterVersion) ||
      ("officialStatusVerified" in event && event.officialStatusVerified !== false)
    ) {
      throw new CaseDossierAssemblyError(
        "CASE_DOSSIER_LIFECYCLE_MISMATCH",
        "Lifecycle event does not match the frozen Case Candidate identity",
      );
    }
  }
  return response;
}

function directText(value: unknown): string | undefined {
  return nonEmpty(value) ? value.trim() : undefined;
}

function deterministicDossierId(
  candidate: CaseCandidateV1,
  collection: CaseEvidenceCollectionV1,
): string {
  return `case-dossier_${sha256(
    canonical({
      candidateId: candidate.candidateId,
      evidenceCollectionId: collection.collectionId,
      sourceMatterId: candidate.sourceMatterId,
      sourceMatterVersion: candidate.sourceMatterVersion,
      sourceSnapshotSha256: candidate.sourceSnapshotSha256,
    }),
  ).slice(0, 32)}`;
}

function buildDocuments(collection: CaseEvidenceCollectionV1): CaseDossierDocumentV1[] {
  const documents: CaseDossierDocumentV1[] = [];
  for (const packageEvidence of [...collection.documentPackages].sort((left, right) =>
    left.documentPackageId.localeCompare(right.documentPackageId),
  )) {
    const payload = parseExactPayload(
      packageEvidence.payload,
      `Document Package ${packageEvidence.documentPackageId}`,
    );
    if (
      payload.documentPackageId !== packageEvidence.documentPackageId ||
      !sameVersion(
        payload.sourceFormalMatterVersion,
        collection.sourceMatter.sourceMatterVersion,
      ) ||
      payload.sourceFormalMatterHash !== collection.sourceMatter.sourceSnapshotSha256
    ) {
      throw new CaseDossierAssemblyError(
        "CASE_DOSSIER_DOCUMENT_LINEAGE_MISMATCH",
        `Document Package ${packageEvidence.documentPackageId} does not match the evidence collection source snapshot`,
      );
    }
    const packageRef = evidenceRef(
      collection,
      packageEvidence.payload,
      "DOCUMENT_PACKAGE",
      packageEvidence.documentPackageId,
    );
    if (!Array.isArray(payload.documentItems)) continue;
    for (const rawItem of payload.documentItems) {
      const item = object(rawItem);
      if (!item || !nonEmpty(item.documentItemId)) continue;
      const documentReference = object(item.documentReference);
      const document: CaseDossierDocumentV1 = {
        documentId: `${packageEvidence.documentPackageId}:${item.documentItemId}`,
        documentPackageId: packageEvidence.documentPackageId,
        documentItemId: item.documentItemId,
        ...(directText(item.documentType) ? { documentType: directText(item.documentType) } : {}),
        ...(directText(item.displayName)
          ? { displayName: directText(item.displayName) }
          : documentReference && directText(documentReference.fileName)
            ? { displayName: directText(documentReference.fileName) }
            : {}),
        ...(documentReference && directText(documentReference.checksum)
          ? { checksum: directText(documentReference.checksum) }
          : {}),
        ...(documentReference && directText(documentReference.storageReference)
          ? { storageReference: directText(documentReference.storageReference) }
          : {}),
        ...(directText(item.verificationStatus)
          ? { verificationStatus: directText(item.verificationStatus) }
          : {}),
        evidence: [packageRef],
      };
      documents.push(document);
    }
  }
  return documents.sort((left, right) => left.documentId.localeCompare(right.documentId));
}

function buildLifecycleTimeline(
  collection: CaseEvidenceCollectionV1,
  lifecycle: Record<string, unknown> | null,
): CaseDossierTimelineEventV1[] {
  if (!lifecycle || !Array.isArray(lifecycle.events) || !collection.lifecycleProvenance) return [];
  const ref = evidenceRef(collection, collection.lifecycleProvenance, "LIFECYCLE_PROVENANCE");
  return lifecycle.events
    .map(object)
    .filter((event): event is Record<string, unknown> => Boolean(event))
    .filter((event) => timestamp(event.occurredAt) && nonEmpty(event.lifecycleEventId))
    .map((event) => {
      const action =
        directText(event.customerSafeLabel) ??
        directText(event.eventCode) ??
        "Lifecycle event recorded";
      const result: CaseDossierTimelineEventV1 = {
        eventId: String(event.lifecycleEventId),
        occurredAt: { value: String(event.occurredAt), evidence: [ref] },
        action: { value: action, evidence: [ref] },
        inputEvidence: [],
        outputEvidence: [ref],
      };
      const state = directText(event.state);
      if (state) result.resultingStatus = { value: state, evidence: [ref] };
      return result;
    })
    .sort((left, right) => {
      const time = Date.parse(left.occurredAt.value) - Date.parse(right.occurredAt.value);
      return time || left.eventId.localeCompare(right.eventId);
    });
}

export function assembleCaseDossierV1(
  candidate: Readonly<CaseCandidateV1>,
  collection: Readonly<CaseEvidenceCollectionV1>,
): CaseDossierV1 {
  if (!isCaseCandidateV1(candidate)) {
    throw new CaseDossierAssemblyError(
      "CASE_DOSSIER_CANDIDATE_INVALID",
      "Case Candidate is invalid",
    );
  }
  if (!isCaseEvidenceCollectionV1(collection)) {
    throw new CaseDossierAssemblyError(
      "CASE_DOSSIER_COLLECTION_INVALID",
      "Case evidence collection is invalid",
    );
  }
  assertLineage(candidate, collection);

  const { matter } = formalMatterResponse(collection, candidate);
  const formalRef = evidenceRef(collection, collection.formalMatter, "FORMAL_MATTER");
  const sourceSnapshot = object(matter.sourceSnapshot);
  const preparation = object(sourceSnapshot?.preparation);
  const lifecycle = lifecycleResponse(collection, candidate);

  const identity: CaseDossierV1["identity"] = { parties: [] };
  const jurisdiction = directText(preparation?.targetJurisdiction);
  if (jurisdiction) identity.jurisdiction = { value: jurisdiction, evidence: [formalRef] };
  const matterType = directText(matter.kind);
  if (matterType) identity.matterType = { value: matterType, evidence: [formalRef] };
  const markReference = directText(preparation?.trademark);
  if (markReference) identity.markReference = { value: markReference, evidence: [formalRef] };
  const startingState = directText(matter.status);
  if (startingState) {
    identity.startingProceduralState = { value: startingState, evidence: [formalRef] };
  }
  const applicant = directText(preparation?.applicantName);
  if (applicant) {
    identity.parties.push({ role: "APPLICANT", displayName: applicant, evidence: [formalRef] });
  }
  const createdAt = timestamp(matter.createdAt) ? matter.createdAt : undefined;
  if (createdAt) identity.casePeriod = { startedAt: { value: createdAt, evidence: [formalRef] } };

  const narrative: CaseDossierNarrativeStatementV1[] = [];
  if (matterType || startingState) {
    narrative.push({
      statementId: "formal-matter-recorded",
      text: [
        `MarkReg recorded Formal Matter ${candidate.sourceMatterId}`,
        matterType ? `as ${matterType}` : undefined,
        startingState ? `with recorded state ${startingState}` : undefined,
      ]
        .filter(Boolean)
        .join(" "),
      evidence: [formalRef],
    });
  }

  const lifecycleTimeline = buildLifecycleTimeline(collection, lifecycle);
  const timeline: CaseDossierTimelineEventV1[] = [];
  if (createdAt) {
    const event: CaseDossierTimelineEventV1 = {
      eventId: "formal-matter-created",
      occurredAt: { value: createdAt, evidence: [formalRef] },
      action: { value: "Formal Matter created", evidence: [formalRef] },
      inputEvidence: [],
      outputEvidence: [formalRef],
    };
    if (startingState) event.resultingStatus = { value: startingState, evidence: [formalRef] };
    timeline.push(event);
  }
  timeline.push(...lifecycleTimeline);
  timeline.sort((left, right) => {
    const time = Date.parse(left.occurredAt.value) - Date.parse(right.occurredAt.value);
    return time || left.eventId.localeCompare(right.eventId);
  });

  const documents = buildDocuments(collection);
  const durations: CaseDossierV1["durations"] = [];
  if (createdAt && lifecycleTimeline.length > 0) {
    const latest = lifecycleTimeline[lifecycleTimeline.length - 1]!;
    const milliseconds = Date.parse(latest.occurredAt.value) - Date.parse(createdAt);
    if (milliseconds >= 0) {
      durations.push({
        durationId: "formal-matter-to-latest-lifecycle-event",
        label: "Observed time from Formal Matter creation to latest captured lifecycle event",
        milliseconds,
        calculationBasis: "DETERMINISTIC_TIMESTAMP_DIFFERENCE",
        startedAt: { value: createdAt, evidence: [formalRef] },
        endedAt: latest.occurredAt,
      });
    }
  }

  const lifecycleOmitted = collection.omissions.some(
    (entry) => entry.surface === "LIFECYCLE_PROVENANCE",
  );
  const documentsOmitted = collection.omissions.some(
    (entry) => entry.surface === "DOCUMENT_PACKAGES",
  );
  const assembledAt = collection.collectedAt;
  const dossier: CaseDossierV1 = {
    protocolVersion: CASE_DOSSIER_PROTOCOL_VERSION,
    objectType: CASE_DOSSIER_OBJECT_TYPE,
    dossierId: deterministicDossierId(candidate, collection),
    version: 1,
    candidateId: candidate.candidateId,
    evidenceCollectionId: collection.collectionId,
    sourceMatter: {
      sourceMatterId: candidate.sourceMatterId,
      sourceMatterVersion: candidate.sourceMatterVersion,
      sourceSnapshotSha256: candidate.sourceSnapshotSha256,
      sourceWorkspaceId: candidate.accessScope.sourceWorkspaceId,
    },
    state: "ASSEMBLED",
    accessClassification: candidate.accessScope.classification,
    identity,
    narrative,
    timeline,
    documents,
    money: [],
    durations,
    completeness: {
      matterMetadata: "PRESENT",
      startEndState: "MISSING",
      timeline: lifecycleOmitted
        ? "SOURCE_UNAVAILABLE"
        : timeline.length > 0
          ? "PRESENT"
          : "MISSING",
      communications: "SOURCE_UNAVAILABLE",
      materialDocuments: documentsOmitted
        ? "SOURCE_UNAVAILABLE"
        : documents.length > 0
          ? "PRESENT"
          : "MISSING",
      feeData: "MISSING",
      outcome: "MISSING",
      privacyReview: "PENDING_REVIEW",
      sourceReferences: "PRESENT",
    },
    assembledAt,
    updatedAt: assembledAt,
  };

  if (!isCaseDossierV1(dossier)) {
    throw new CaseDossierAssemblyError(
      "CASE_DOSSIER_OUTPUT_INVALID",
      "Deterministic Case Dossier assembly produced an invalid dossier",
    );
  }
  return dossier;
}
