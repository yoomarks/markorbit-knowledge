import { describe, expect, it } from "vitest";
import { isAiAssignmentLibraryV1, type AiAssignmentLibraryV1 } from "./ai-assignment-library-v1";

const library = (): AiAssignmentLibraryV1 => ({
  protocolVersion: "1.0",
  objectType: "AI_ASSIGNMENT_LIBRARY",
  libraryId: "kal_us_trademark_core",
  revision: 1,
  title: "United States Trademark Assignment Library",
  jurisdiction: "US",
  domain: "TRADEMARK",
  entries: [
    {
      sequence: 1,
      workflow: "FILING",
      assignmentId: "kas_us_trademark_filing",
      tags: ["filing", "application"],
    },
    {
      sequence: 2,
      workflow: "EXAMINATION",
      assignmentId: "kas_us_trademark_examination",
      tags: ["examination", "uspto"],
    },
  ],
  boundaries: {
    answerContentStored: false,
    executionAuthorityGranted: false,
    legalTruthVerified: false,
    candidateAutoActivation: false,
  },
  createdAt: "2026-08-24T00:00:00.000Z",
  changeReason: "Initial governed assignment library",
});

describe("AiAssignmentLibraryV1", () => {
  it("accepts a deterministic governed library index", () => {
    expect(isAiAssignmentLibraryV1(library())).toBe(true);
  });

  it("allows multiple distinct propositions inside the same workflow", () => {
    expect(
      isAiAssignmentLibraryV1({
        ...library(),
        entries: [
          library().entries[0],
          {
            ...library().entries[1],
            workflow: "FILING",
          },
        ],
      }),
    ).toBe(true);
  });

  it("rejects duplicate assignment identities, tags, and sequence gaps", () => {
    expect(
      isAiAssignmentLibraryV1({
        ...library(),
        entries: [
          library().entries[0],
          {
            ...library().entries[1],
            assignmentId: "kas_us_trademark_filing",
          },
        ],
      }),
    ).toBe(false);
    expect(
      isAiAssignmentLibraryV1({
        ...library(),
        entries: [
          {
            ...library().entries[0],
            tags: ["filing", "filing"],
          },
          library().entries[1],
        ],
      }),
    ).toBe(false);
    expect(
      isAiAssignmentLibraryV1({
        ...library(),
        entries: [
          library().entries[0],
          {
            ...library().entries[1],
            sequence: 3,
          },
        ],
      }),
    ).toBe(false);
  });

  it("rejects any authority or legal-truth escalation", () => {
    expect(
      isAiAssignmentLibraryV1({
        ...library(),
        boundaries: {
          ...library().boundaries,
          executionAuthorityGranted: true,
        },
      }),
    ).toBe(false);
    expect(
      isAiAssignmentLibraryV1({
        ...library(),
        boundaries: {
          ...library().boundaries,
          candidateAutoActivation: true,
        },
      }),
    ).toBe(false);
  });
});
