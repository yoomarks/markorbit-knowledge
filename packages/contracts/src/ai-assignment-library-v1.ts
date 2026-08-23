export const AI_ASSIGNMENT_LIBRARY_PROTOCOL_VERSION = "1.0" as const;
export const AI_ASSIGNMENT_LIBRARY_OBJECT_TYPE = "AI_ASSIGNMENT_LIBRARY" as const;

export type AiAssignmentLibraryEntryV1 = {
  sequence: number;
  workflow: string;
  assignmentId: string;
  tags: readonly string[];
};

export type AiAssignmentLibraryV1 = {
  protocolVersion: typeof AI_ASSIGNMENT_LIBRARY_PROTOCOL_VERSION;
  objectType: typeof AI_ASSIGNMENT_LIBRARY_OBJECT_TYPE;
  libraryId: string;
  revision: number;
  title: string;
  jurisdiction: string;
  domain: string;
  entries: readonly AiAssignmentLibraryEntryV1[];
  boundaries: {
    answerContentStored: false;
    executionAuthorityGranted: false;
    legalTruthVerified: false;
    candidateAutoActivation: false;
  };
  createdAt: string;
  changeReason: string;
};

const ID = /^[a-z][a-z0-9_]{2,127}$/u;
const WORKFLOW = /^[A-Z][A-Z0-9_]{1,63}$/u;

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

function isEntry(value: unknown): value is AiAssignmentLibraryEntryV1 {
  const item = record(value);
  if (!item || !exactKeys(item, ["sequence", "workflow", "assignmentId", "tags"])) return false;
  if (
    !Number.isSafeInteger(item.sequence) ||
    (item.sequence as number) <= 0 ||
    typeof item.workflow !== "string" ||
    !WORKFLOW.test(item.workflow) ||
    typeof item.assignmentId !== "string" ||
    !item.assignmentId.startsWith("kas_") ||
    !ID.test(item.assignmentId) ||
    !Array.isArray(item.tags) ||
    !item.tags.every(nonEmpty)
  ) {
    return false;
  }
  return new Set(item.tags as string[]).size === item.tags.length;
}

export function isAiAssignmentLibraryV1(value: unknown): value is AiAssignmentLibraryV1 {
  const item = record(value);
  if (
    !item ||
    !exactKeys(item, [
      "protocolVersion",
      "objectType",
      "libraryId",
      "revision",
      "title",
      "jurisdiction",
      "domain",
      "entries",
      "boundaries",
      "createdAt",
      "changeReason",
    ])
  ) {
    return false;
  }
  const boundaries = record(item.boundaries);
  if (
    !boundaries ||
    !exactKeys(boundaries, [
      "answerContentStored",
      "executionAuthorityGranted",
      "legalTruthVerified",
      "candidateAutoActivation",
    ])
  ) {
    return false;
  }
  if (!Array.isArray(item.entries) || item.entries.length === 0 || !item.entries.every(isEntry)) {
    return false;
  }

  const entries = item.entries as AiAssignmentLibraryEntryV1[];
  const assignmentIds = new Set(entries.map((entry) => entry.assignmentId));
  const workflows = new Set(entries.map((entry) => entry.workflow));
  const sortedSequences = entries.map((entry) => entry.sequence).sort((left, right) => left - right);
  const sequencesAreContiguous = sortedSequences.every((sequence, index) => sequence === index + 1);

  return (
    item.protocolVersion === AI_ASSIGNMENT_LIBRARY_PROTOCOL_VERSION &&
    item.objectType === AI_ASSIGNMENT_LIBRARY_OBJECT_TYPE &&
    typeof item.libraryId === "string" &&
    item.libraryId.startsWith("kal_") &&
    ID.test(item.libraryId) &&
    Number.isSafeInteger(item.revision) &&
    (item.revision as number) > 0 &&
    nonEmpty(item.title) &&
    nonEmpty(item.jurisdiction) &&
    nonEmpty(item.domain) &&
    assignmentIds.size === entries.length &&
    workflows.size === entries.length &&
    sequencesAreContiguous &&
    boundaries.answerContentStored === false &&
    boundaries.executionAuthorityGranted === false &&
    boundaries.legalTruthVerified === false &&
    boundaries.candidateAutoActivation === false &&
    timestamp(item.createdAt) &&
    nonEmpty(item.changeReason)
  );
}

export function assertAiAssignmentLibraryV1(value: unknown): asserts value is AiAssignmentLibraryV1 {
  if (!isAiAssignmentLibraryV1(value)) throw new TypeError("Invalid AiAssignmentLibraryV1");
}
