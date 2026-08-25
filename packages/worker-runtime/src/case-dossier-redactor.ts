import { createHash } from "node:crypto";
import {
  CASE_DOSSIER_PRIVACY_PROTOCOL_VERSION,
  CASE_DOSSIER_REDACTED_DERIVATIVE_OBJECT_TYPE,
  isCaseDossierPrivacyReviewV1,
  isCaseDossierRedactedDerivativeV1,
  isCaseDossierV1,
  type CaseDossierAudienceViewV1,
  type CaseDossierPrivacyFindingV1,
  type CaseDossierPrivacyTargetV1,
  type CaseDossierPrivacyReviewV1,
  type CaseDossierRedactedDerivativeV1,
  type CaseDossierV1,
} from "@markorbit/contracts";

const REDACTED_VALUE = "[REDACTED]";

export class CaseDossierRedactionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CaseDossierRedactionError";
  }
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

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function targetKey(target: CaseDossierPrivacyTargetV1): string {
  return [target.section, target.field, target.itemId ?? "", String(target.itemIndex ?? "")].join(
    "\u001f",
  );
}

function audienceView(dossier: CaseDossierV1): CaseDossierAudienceViewV1 {
  return {
    identity: {
      ...(dossier.identity.jurisdiction ? { jurisdiction: dossier.identity.jurisdiction.value } : {}),
      ...(dossier.identity.matterType ? { matterType: dossier.identity.matterType.value } : {}),
      ...(dossier.identity.markReference ? { markReference: dossier.identity.markReference.value } : {}),
      ...(dossier.identity.applicationNumber
        ? { applicationNumber: dossier.identity.applicationNumber.value }
        : {}),
      ...(dossier.identity.registrationNumber
        ? { registrationNumber: dossier.identity.registrationNumber.value }
        : {}),
      ...(dossier.identity.initiatingRequest
        ? { initiatingRequest: dossier.identity.initiatingRequest.value }
        : {}),
      ...(dossier.identity.startingProceduralState
        ? { startingProceduralState: dossier.identity.startingProceduralState.value }
        : {}),
      parties: dossier.identity.parties.map((party) => ({
        role: party.role,
        displayName: party.displayName,
      })),
    },
    narrative: dossier.narrative.map((statement) => ({
      statementId: statement.statementId,
      text: statement.text,
    })),
    timeline: dossier.timeline.map((event) => ({
      eventId: event.eventId,
      occurredAt: event.occurredAt.value,
      action: event.action.value,
      ...(event.actorRole ? { actorRole: event.actorRole.value } : {}),
      ...(event.resultingStatus ? { resultingStatus: event.resultingStatus.value } : {}),
      ...(event.deadline ? { deadline: event.deadline.value } : {}),
    })),
    documents: dossier.documents.map((document) => ({
      documentId: document.documentId,
      ...(document.documentType ? { documentType: document.documentType } : {}),
      ...(document.displayName ? { displayName: document.displayName } : {}),
      ...(document.verificationStatus
        ? { verificationStatus: document.verificationStatus }
        : {}),
    })),
    money: dossier.money.map((amount) => ({
      amount: amount.amount,
      currency: amount.currency,
      category: amount.category,
    })),
    durations: dossier.durations.map((duration) => ({
      durationId: duration.durationId,
      label: duration.label,
      milliseconds: duration.milliseconds,
    })),
    ...(dossier.outcome
      ? {
          outcome: {
            code: dossier.outcome.code,
            label: dossier.outcome.label,
            ...(dossier.outcome.occurredAt
              ? { occurredAt: dossier.outcome.occurredAt.value }
              : {}),
          },
        }
      : {}),
  };
}

function requireTarget(content: CaseDossierAudienceViewV1, target: CaseDossierPrivacyTargetV1): void {
  let exists = false;
  switch (target.section) {
    case "IDENTITY":
      exists = target.field in content.identity;
      break;
    case "PARTY":
      exists =
        target.itemIndex !== undefined &&
        target.itemIndex >= 0 &&
        target.itemIndex < content.identity.parties.length;
      break;
    case "NARRATIVE":
      exists = content.narrative.some((item) => item.statementId === target.itemId);
      break;
    case "TIMELINE":
      exists = content.timeline.some(
        (item) => item.eventId === target.itemId && target.field in item,
      );
      break;
    case "DOCUMENT":
      exists = content.documents.some(
        (item) => item.documentId === target.itemId && target.field in item,
      );
      break;
    case "MONEY":
      exists =
        target.itemIndex !== undefined && target.itemIndex >= 0 && target.itemIndex < content.money.length;
      break;
    case "OUTCOME":
      exists = content.outcome !== undefined && target.field in content.outcome;
      break;
  }
  if (!exists) {
    throw new CaseDossierRedactionError(
      "CASE_DOSSIER_REDACTION_TARGET_MISSING",
      `Privacy finding target ${target.section}:${target.field} does not exist in the source Dossier audience projection`,
    );
  }
}

function maskTarget(content: CaseDossierAudienceViewV1, target: CaseDossierPrivacyTargetV1): void {
  switch (target.section) {
    case "IDENTITY":
      (content.identity as unknown as Record<string, unknown>)[target.field] = REDACTED_VALUE;
      return;
    case "PARTY":
      content.identity.parties[target.itemIndex!]!.displayName = REDACTED_VALUE;
      return;
    case "NARRATIVE": {
      const item = content.narrative.find((entry) => entry.statementId === target.itemId)!;
      item.text = REDACTED_VALUE;
      return;
    }
    case "TIMELINE": {
      const item = content.timeline.find((entry) => entry.eventId === target.itemId)!;
      (item as unknown as Record<string, unknown>)[target.field] = REDACTED_VALUE;
      return;
    }
    case "DOCUMENT": {
      const item = content.documents.find((entry) => entry.documentId === target.itemId)!;
      (item as unknown as Record<string, unknown>)[target.field] = REDACTED_VALUE;
      return;
    }
    case "MONEY":
      (content.money[target.itemIndex!]! as unknown as Record<string, unknown>)[target.field] =
        REDACTED_VALUE;
      return;
    case "OUTCOME":
      (content.outcome! as unknown as Record<string, unknown>)[target.field] = REDACTED_VALUE;
  }
}

function omitTargets(
  content: CaseDossierAudienceViewV1,
  findings: readonly CaseDossierPrivacyFindingV1[],
): void {
  const identityFields = new Set<string>();
  const partyIndexes = new Set<number>();
  const narrativeIds = new Set<string>();
  const timelineIds = new Set<string>();
  const documentIds = new Set<string>();
  const moneyIndexes = new Set<number>();
  let omitOutcome = false;

  for (const finding of findings) {
    if (finding.action !== "OMIT_ITEM") continue;
    const target = finding.target;
    switch (target.section) {
      case "IDENTITY":
        identityFields.add(target.field);
        break;
      case "PARTY":
        partyIndexes.add(target.itemIndex!);
        break;
      case "NARRATIVE":
        narrativeIds.add(target.itemId!);
        break;
      case "TIMELINE":
        timelineIds.add(target.itemId!);
        break;
      case "DOCUMENT":
        documentIds.add(target.itemId!);
        break;
      case "MONEY":
        moneyIndexes.add(target.itemIndex!);
        break;
      case "OUTCOME":
        omitOutcome = true;
        break;
    }
  }

  for (const field of identityFields) {
    delete (content.identity as unknown as Record<string, unknown>)[field];
  }
  content.identity.parties = content.identity.parties.filter((_, index) => !partyIndexes.has(index));
  content.narrative = content.narrative.filter((item) => !narrativeIds.has(item.statementId));
  content.timeline = content.timeline.filter((item) => !timelineIds.has(item.eventId));
  content.documents = content.documents.filter((item) => !documentIds.has(item.documentId));
  content.money = content.money.filter((_, index) => !moneyIndexes.has(index));
  if (omitOutcome) delete content.outcome;
}

export function redactCaseDossierV1(
  dossier: CaseDossierV1,
  review: CaseDossierPrivacyReviewV1,
): CaseDossierRedactedDerivativeV1 {
  if (!isCaseDossierV1(dossier)) {
    throw new CaseDossierRedactionError("CASE_DOSSIER_INVALID", "Source Case Dossier is invalid");
  }
  if (!isCaseDossierPrivacyReviewV1(review)) {
    throw new CaseDossierRedactionError("CASE_DOSSIER_PRIVACY_REVIEW_INVALID", "Privacy review is invalid");
  }
  if (review.state !== "FINALIZED" || !review.derivativeId || !review.decidedAt) {
    throw new CaseDossierRedactionError(
      "CASE_DOSSIER_PRIVACY_REVIEW_NOT_FINALIZED",
      "A finalized privacy review is required before an audience derivative can be generated",
    );
  }
  if (
    review.dossierId !== dossier.dossierId ||
    review.dossierVersion !== dossier.version ||
    review.sourceAccessClassification !== dossier.accessClassification
  ) {
    throw new CaseDossierRedactionError(
      "CASE_DOSSIER_PRIVACY_SOURCE_MISMATCH",
      "Privacy review does not match the source Case Dossier identity and access classification",
    );
  }

  const findings = [...review.findings].sort((left, right) => left.findingId.localeCompare(right.findingId));
  const seenTargets = new Set<string>();
  const content = audienceView(dossier);
  for (const finding of findings) {
    const key = targetKey(finding.target);
    if (seenTargets.has(key)) {
      throw new CaseDossierRedactionError(
        "CASE_DOSSIER_PRIVACY_TARGET_CONFLICT",
        "A privacy review cannot apply multiple findings to the same redaction target",
      );
    }
    seenTargets.add(key);
    requireTarget(content, finding.target);
  }

  for (const finding of findings) {
    if (finding.action === "MASK_VALUE") maskTarget(content, finding.target);
  }
  omitTargets(content, findings);

  const derivative: CaseDossierRedactedDerivativeV1 = {
    protocolVersion: CASE_DOSSIER_PRIVACY_PROTOCOL_VERSION,
    objectType: CASE_DOSSIER_REDACTED_DERIVATIVE_OBJECT_TYPE,
    derivativeId: review.derivativeId,
    version: 1,
    sourceDossierId: dossier.dossierId,
    sourceDossierVersion: dossier.version,
    reviewId: review.reviewId,
    accessClassification: review.audienceAccessClassification,
    generatedAt: review.decidedAt,
    contentSha256: sha256(canonical(content)),
    redactions: findings.map((finding) => ({
      findingId: finding.findingId,
      target: finding.target,
      action: finding.action,
    })),
    content,
    publicationAuthorized: false,
  };
  if (!isCaseDossierRedactedDerivativeV1(derivative)) {
    throw new CaseDossierRedactionError(
      "CASE_DOSSIER_REDACTED_DERIVATIVE_INVALID",
      "Redaction produced an invalid Case Dossier audience derivative",
    );
  }
  return derivative;
}
