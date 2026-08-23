export const AI_ASSIGNMENT_CANDIDATE_PROTOCOL_VERSION = "1.0" as const;
export const AI_ASSIGNMENT_CANDIDATE_OBJECT_TYPE = "AI_ASSIGNMENT_CANDIDATE" as const;

export const AI_ASSIGNMENT_CANDIDATE_EVIDENCE_CLASSES = [
  "OFFICIAL",
  "PROFESSIONAL",
  "INDUSTRY",
  "SYNTHETIC_AI",
] as const;
export const AI_ASSIGNMENT_CANDIDATE_DISCOVERY_METHODS = [
  "EVIDENCE_GAP",
  "STRUCTURE_EXPANSION",
  "AI_FOLLOW_UP",
] as const;

export type AiAssignmentCandidateEvidenceClass =
  (typeof AI_ASSIGNMENT_CANDIDATE_EVIDENCE_CLASSES)[number];
export type AiAssignmentCandidateDiscoveryMethod =
  (typeof AI_ASSIGNMENT_CANDIDATE_DISCOVERY_METHODS)[number];

export type AiAssignmentCandidateEvidenceV1 = {
  evidenceRef: string;
  evidenceClass: AiAssignmentCandidateEvidenceClass;
  sha256: string;
  rationale: string;
};

export type AiAssignmentCandidateV1 = {
  protocolVersion: typeof AI_ASSIGNMENT_CANDIDATE_PROTOCOL_VERSION;
  objectType: typeof AI_ASSIGNMENT_CANDIDATE_OBJECT_TYPE;
  candidateId: string;
  graphId: string;
  graphRevision: number;
  parentAssignmentId: string;
  suggestedRelation: "DECOMPOSES" | "DEPENDS_ON" | "SUPPORTS";
  jurisdiction: string;
  domain: string;
  topic: string;
  title: string;
  instructionSetId: string;
  instructionSetRevision: number;
  language: string;
  proposedPrompt: string;
  discoveryMethod: AiAssignmentCandidateDiscoveryMethod;
  evidence: AiAssignmentCandidateEvidenceV1[];
  status: "PROPOSED";
  boundaries: {
    activationAuthorized: false;
    executionAuthorityGranted: false;
    legalTruthVerified: false;
    recursiveAutoExecution: false;
  };
  createdAt: string;
};

const ID = /^[a-z][a-z0-9_]{2,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isEvidence(value: unknown): value is AiAssignmentCandidateEvidenceV1 {
  const item = record(value);
  return Boolean(
    item &&
      exactKeys(item, ["evidenceRef", "evidenceClass", "sha256", "rationale"]) &&
      nonEmpty(item.evidenceRef) &&
      typeof item.evidenceClass === "string" &&
      (AI_ASSIGNMENT_CANDIDATE_EVIDENCE_CLASSES as readonly string[]).includes(
        item.evidenceClass,
      ) &&
      typeof item.sha256 === "string" &&
      SHA256.test(item.sha256) &&
      nonEmpty(item.rationale),
  );
}

export function isAiAssignmentCandidateV1(value: unknown): value is AiAssignmentCandidateV1 {
  const item = record(value);
  if (
    !item ||
    !exactKeys(item, [
      "protocolVersion",
      "objectType",
      "candidateId",
      "graphId",
      "graphRevision",
      "parentAssignmentId",
      "suggestedRelation",
      "jurisdiction",
      "domain",
      "topic",
      "title",
      "instructionSetId",
      "instructionSetRevision",
      "language",
      "proposedPrompt",
      "discoveryMethod",
      "evidence",
      "status",
      "boundaries",
      "createdAt",
    ])
  ) {
    return false;
  }

  const boundaries = record(item.boundaries);
  return Boolean(
    item.protocolVersion === AI_ASSIGNMENT_CANDIDATE_PROTOCOL_VERSION &&
      item.objectType === AI_ASSIGNMENT_CANDIDATE_OBJECT_TYPE &&
      typeof item.candidateId === "string" &&
      item.candidateId.startsWith("kac_") &&
      ID.test(item.candidateId) &&
      typeof item.graphId === "string" &&
      item.graphId.startsWith("kag_") &&
      ID.test(item.graphId) &&
      Number.isSafeInteger(item.graphRevision) &&
      (item.graphRevision as number) > 0 &&
      typeof item.parentAssignmentId === "string" &&
      item.parentAssignmentId.startsWith("kas_") &&
      ID.test(item.parentAssignmentId) &&
      typeof item.suggestedRelation === "string" &&
      ["DECOMPOSES", "DEPENDS_ON", "SUPPORTS"].includes(item.suggestedRelation) &&
      nonEmpty(item.jurisdiction) &&
      nonEmpty(item.domain) &&
      nonEmpty(item.topic) &&
      nonEmpty(item.title) &&
      typeof item.instructionSetId === "string" &&
      item.instructionSetId.startsWith("kis_") &&
      ID.test(item.instructionSetId) &&
      Number.isSafeInteger(item.instructionSetRevision) &&
      (item.instructionSetRevision as number) > 0 &&
      nonEmpty(item.language) &&
      nonEmpty(item.proposedPrompt) &&
      typeof item.discoveryMethod === "string" &&
      (AI_ASSIGNMENT_CANDIDATE_DISCOVERY_METHODS as readonly string[]).includes(
        item.discoveryMethod,
      ) &&
      Array.isArray(item.evidence) &&
      item.evidence.length > 0 &&
      item.evidence.every(isEvidence) &&
      new Set(
        (item.evidence as AiAssignmentCandidateEvidenceV1[]).map(
          (entry) => `${entry.evidenceRef}\u0000${entry.sha256}`,
        ),
      ).size === item.evidence.length &&
      item.status === "PROPOSED" &&
      boundaries &&
      exactKeys(boundaries, [
        "activationAuthorized",
        "executionAuthorityGranted",
        "legalTruthVerified",
        "recursiveAutoExecution",
      ]) &&
      boundaries.activationAuthorized === false &&
      boundaries.executionAuthorityGranted === false &&
      boundaries.legalTruthVerified === false &&
      boundaries.recursiveAutoExecution === false &&
      timestamp(item.createdAt),
  );
}

export function assertAiAssignmentCandidateV1(
  value: unknown,
): asserts value is AiAssignmentCandidateV1 {
  if (!isAiAssignmentCandidateV1(value)) {
    throw new TypeError("Invalid AiAssignmentCandidateV1");
  }
}
