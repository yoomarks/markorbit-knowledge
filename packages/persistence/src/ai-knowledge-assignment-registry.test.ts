import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { AiInstructionSetV1, AiKnowledgeAssignmentV1 } from "@markorbit/contracts";
import { SqliteAiKnowledgeAssignmentRepository } from "./ai-knowledge-assignment-registry";

const instructionSet = (revision = 1): AiInstructionSetV1 => ({
  protocolVersion: "1.0",
  objectType: "AI_INSTRUCTION_SET",
  instructionSetId: "kis_trademark_procedure",
  revision,
  name: "Trademark procedure research",
  purpose: "Produce comprehensive procedural research as Markdown without asserting MarkOrbit legal truth.",
  stableInstructions: [
    "Separate normal deadlines from grace periods.",
    "Identify exceptions and remedies when known.",
    "Return Markdown only.",
  ],
  requiredSections: ["Overview", "Procedure", "Deadlines", "Evidence", "Exceptions"],
  outputFormat: "MARKDOWN",
  createdAt: revision === 1 ? "2026-08-23T04:10:00.000Z" : "2026-08-23T04:20:00.000Z",
  changeReason: revision === 1 ? "Initial governed instruction grammar" : "Add evidence-backed exception coverage",
  triggerEvidenceRefs: revision === 1 ? [] : ["raw_uspto_section8_audit_20260823"],
});

const assignment: AiKnowledgeAssignmentV1 = {
  protocolVersion: "1.0",
  objectType: "AI_KNOWLEDGE_ASSIGNMENT",
  assignmentId: "kas_us_trademark_section8",
  jurisdiction: "US",
  domain: "TRADEMARK",
  topic: "DECLARATION_OF_USE",
  title: "United States Trademark Declaration of Use",
  instructionSetId: "kis_trademark_procedure",
  instructionSetRevision: 1,
  language: "zh-CN",
  prompt: "Research U.S. trademark declarations of use and return Markdown.",
  createdAt: "2026-08-23T04:11:00.000Z",
};

describe("SqliteAiKnowledgeAssignmentRepository", () => {
  it("persists immutable instruction revisions and assignments across repository restart", () => {
    const database = new DatabaseSync(":memory:");
    const first = new SqliteAiKnowledgeAssignmentRepository(database);
    first.saveInstructionSet(instructionSet());
    first.saveAssignment(assignment);

    const restarted = new SqliteAiKnowledgeAssignmentRepository(database);
    expect(restarted.getInstructionSet("kis_trademark_procedure", 1)).toEqual(instructionSet());
    expect(restarted.getAssignment(assignment.assignmentId)).toEqual(assignment);
    expect(
      restarted.listAssignmentsByTopic({
        jurisdiction: "US",
        domain: "TRADEMARK",
        topic: "DECLARATION_OF_USE",
      }),
    ).toEqual([assignment]);
    database.close();
  });

  it("allows sequential instruction evolution without mutating old revisions", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteAiKnowledgeAssignmentRepository(database);
    repository.saveInstructionSet(instructionSet(1));
    repository.saveInstructionSet(instructionSet(2));

    expect(repository.getLatestInstructionSet("kis_trademark_procedure")?.revision).toBe(2);
    expect(repository.getInstructionSet("kis_trademark_procedure", 1)).toEqual(instructionSet(1));
    database.close();
  });

  it("rejects revision gaps and same-revision mutations", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteAiKnowledgeAssignmentRepository(database);
    repository.saveInstructionSet(instructionSet(1));

    expect(() => repository.saveInstructionSet(instructionSet(3))).toThrowError(
      /must advance from revision 1 to 2/u,
    );
    expect(() =>
      repository.saveInstructionSet({
        ...instructionSet(1),
        purpose: "Mutated purpose",
      }),
    ).toThrowError(/already exists with different content/u);
    database.close();
  });

  it("rejects assignments whose frozen instruction revision does not exist", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteAiKnowledgeAssignmentRepository(database);
    repository.saveInstructionSet(instructionSet(1));

    expect(() =>
      repository.saveAssignment({
        ...assignment,
        assignmentId: "kas_us_trademark_section8_future",
        instructionSetRevision: 2,
      }),
    ).toThrowError(/references missing instruction set/u);
    database.close();
  });

  it("makes assignment identity immutable", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteAiKnowledgeAssignmentRepository(database);
    repository.saveInstructionSet(instructionSet(1));
    repository.saveAssignment(assignment);

    expect(() =>
      repository.saveAssignment({
        ...assignment,
        prompt: "Different prompt under the same assignment identity.",
      }),
    ).toThrowError(/already exists with different content/u);
    database.close();
  });
});
