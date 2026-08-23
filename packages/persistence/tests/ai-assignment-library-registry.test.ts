import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION,
  AI_KNOWLEDGE_ASSIGNMENT_OBJECT_TYPE,
  isAiAssignmentLibraryV1,
  type AiAssignmentLibraryV1,
  type AiKnowledgeAssignmentV1,
} from "@markorbit/contracts";
import { SqliteAiAssignmentLibraryRepository } from "../src/ai-assignment-library-registry";
import { SqliteAiKnowledgeAssignmentRepository } from "../src/ai-knowledge-assignment-registry";
import {
  US_TRADEMARK_ASSIGNMENT_LIBRARY,
  US_TRADEMARK_ASSIGNMENT_LIBRARY_ID,
  US_TRADEMARK_INSTRUCTION_SET_ID,
  US_TRADEMARK_LIBRARY_ASSIGNMENTS,
  US_TRADEMARK_LIBRARY_WORKFLOWS,
  seedUsTrademarkAssignmentLibrary,
} from "../src/us-trademark-assignment-library";

describe("ADK-08 assignment library", () => {
  it("persists the governed 12-workflow US Trademark proposition library", () => {
    const database = new DatabaseSync(":memory:");
    const library = seedUsTrademarkAssignmentLibrary(database);
    const repository = new SqliteAiAssignmentLibraryRepository(database);

    expect(isAiAssignmentLibraryV1(library)).toBe(true);
    expect(library.entries).toHaveLength(12);
    expect(library.entries.map((entry) => entry.workflow)).toEqual(US_TRADEMARK_LIBRARY_WORKFLOWS);
    expect(new Set(library.entries.map((entry) => entry.assignmentId)).size).toBe(12);
    expect(repository.getLatestLibrary(US_TRADEMARK_ASSIGNMENT_LIBRARY_ID)).toEqual(library);
    expect(repository.listLatestLibrariesByScope({ jurisdiction: "US", domain: "TRADEMARK" })).toEqual([
      library,
    ]);
    expect(library.boundaries).toEqual({
      answerContentStored: false,
      executionAuthorityGranted: false,
      legalTruthVerified: false,
      candidateAutoActivation: false,
    });
    database.close();
  });

  it("resolves durable assignments by workflow without storing provider answers", () => {
    const database = new DatabaseSync(":memory:");
    seedUsTrademarkAssignmentLibrary(database);
    const repository = new SqliteAiAssignmentLibraryRepository(database);

    for (const workflow of US_TRADEMARK_LIBRARY_WORKFLOWS) {
      const assignments = repository.listAssignmentsByWorkflow({
        libraryId: US_TRADEMARK_ASSIGNMENT_LIBRARY_ID,
        revision: 1,
        workflow,
      });
      expect(assignments).toHaveLength(1);
      expect(assignments[0]?.instructionSetId).toBe(US_TRADEMARK_INSTRUCTION_SET_ID);
      expect(assignments[0]?.prompt.length).toBeGreaterThan(100);
    }
    database.close();
  });

  it("is deterministic and idempotent across repeated bootstrap", () => {
    const database = new DatabaseSync(":memory:");
    const first = seedUsTrademarkAssignmentLibrary(database);
    const second = seedUsTrademarkAssignmentLibrary(database);
    const assignments = new SqliteAiKnowledgeAssignmentRepository(database);

    expect(second).toEqual(first);
    for (const expected of US_TRADEMARK_LIBRARY_ASSIGNMENTS) {
      expect(assignments.getAssignment(expected.assignmentId)).toEqual(expected);
    }
    database.close();
  });

  it("rejects immutable library revision drift", () => {
    const database = new DatabaseSync(":memory:");
    seedUsTrademarkAssignmentLibrary(database);
    const repository = new SqliteAiAssignmentLibraryRepository(database);
    const changed: AiAssignmentLibraryV1 = {
      ...US_TRADEMARK_ASSIGNMENT_LIBRARY,
      title: "Changed title must not rewrite revision 1",
    };

    expect(() => repository.saveLibrary(changed)).toThrow(/IMMUTABLE_CONFLICT/u);
    database.close();
  });

  it("fails closed when a library entry crosses jurisdiction or domain scope", () => {
    const database = new DatabaseSync(":memory:");
    seedUsTrademarkAssignmentLibrary(database);
    const assignments = new SqliteAiKnowledgeAssignmentRepository(database);
    const foreignAssignment: AiKnowledgeAssignmentV1 = {
      protocolVersion: AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION,
      objectType: AI_KNOWLEDGE_ASSIGNMENT_OBJECT_TYPE,
      assignmentId: "kas_ca_trademark_office_action",
      jurisdiction: "CA",
      domain: "TRADEMARK",
      topic: "OFFICE_ACTION",
      title: "Canada Trademark Office Action",
      instructionSetId: US_TRADEMARK_INSTRUCTION_SET_ID,
      instructionSetRevision: 1,
      language: "en",
      prompt: "Research the Canadian trademark Office Action lifecycle using current official sources.",
      createdAt: "2026-08-24T00:10:00.000Z",
    };
    assignments.saveAssignment(foreignAssignment);
    const repository = new SqliteAiAssignmentLibraryRepository(database);
    const revisionTwo: AiAssignmentLibraryV1 = {
      ...US_TRADEMARK_ASSIGNMENT_LIBRARY,
      revision: 2,
      createdAt: "2026-08-24T00:10:00.000Z",
      changeReason: "scope mismatch test",
      entries: [
        ...US_TRADEMARK_ASSIGNMENT_LIBRARY.entries,
        {
          sequence: 13,
          workflow: "FOREIGN_SCOPE_TEST",
          assignmentId: foreignAssignment.assignmentId,
          tags: ["scope-test"],
        },
      ],
    };

    expect(isAiAssignmentLibraryV1(revisionTwo)).toBe(true);
    expect(() => repository.saveLibrary(revisionTwo)).toThrow(/SCOPE_MISMATCH/u);
    database.close();
  });
});
