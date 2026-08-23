import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type {
  AiAssignmentGraphV1,
  AiInstructionSetV1,
  AiKnowledgeAssignmentV1,
} from "@markorbit/contracts";
import { SqliteAiKnowledgeAssignmentRepository } from "./ai-knowledge-assignment-registry";
import { SqliteAiAssignmentGraphRepository } from "./ai-assignment-graph-registry";

const instructionSet: AiInstructionSetV1 = {
  protocolVersion: "1.0",
  objectType: "AI_INSTRUCTION_SET",
  instructionSetId: "kis_trademark_procedure",
  revision: 1,
  name: "Trademark procedure research",
  purpose: "Govern reusable AI research assignments for trademark procedure topics.",
  stableInstructions: ["Use Markdown.", "Separate authority from commentary."],
  requiredSections: ["Overview", "Procedure"],
  outputFormat: "MARKDOWN",
  changeReason: "Initial governed research instruction set.",
  triggerEvidenceRefs: [],
  createdAt: "2026-08-23T04:00:00.000Z",
};

function assignment(
  assignmentId: string,
  topic: string,
  createdAt: string,
): AiKnowledgeAssignmentV1 {
  return {
    protocolVersion: "1.0",
    objectType: "AI_KNOWLEDGE_ASSIGNMENT",
    assignmentId,
    jurisdiction: "US",
    domain: "TRADEMARK",
    topic,
    title: topic,
    instructionSetId: instructionSet.instructionSetId,
    instructionSetRevision: 1,
    language: "zh-CN",
    prompt: `Research ${topic} in Markdown.`,
    createdAt,
  };
}

const root = assignment(
  "kas_us_trademark_declaration_use",
  "DECLARATION_OF_USE",
  "2026-08-23T04:01:00.000Z",
);
const evidence = assignment(
  "kas_us_trademark_declaration_evidence",
  "DECLARATION_EVIDENCE",
  "2026-08-23T04:02:00.000Z",
);
const deadline = assignment(
  "kas_us_trademark_declaration_deadline",
  "DECLARATION_DEADLINE",
  "2026-08-23T04:03:00.000Z",
);

function graph(revision = 1): AiAssignmentGraphV1 {
  return {
    protocolVersion: "1.0",
    objectType: "AI_ASSIGNMENT_GRAPH",
    graphId: "kag_us_trademark_declaration_use",
    revision,
    title: "US trademark declaration of use research graph",
    jurisdiction: "US",
    domain: "TRADEMARK",
    rootAssignmentIds: [root.assignmentId],
    nodes: [
      { assignmentId: root.assignmentId, role: "ROOT" },
      { assignmentId: evidence.assignmentId, role: "FOLLOW_UP" },
      { assignmentId: deadline.assignmentId, role: "FOLLOW_UP" },
    ],
    edges: [
      {
        fromAssignmentId: root.assignmentId,
        toAssignmentId: evidence.assignmentId,
        relation: "DECOMPOSES",
      },
      {
        fromAssignmentId: root.assignmentId,
        toAssignmentId: deadline.assignmentId,
        relation: "DECOMPOSES",
      },
    ],
    changeReason:
      revision === 1 ? "Initial governed topology." : "Add verified question topology change.",
    triggerEvidenceRefs: revision === 1 ? [] : ["art_01ARZ3NDEKTSV4RRFFQ69G5FAV"],
    boundaries: {
      executionAuthorityGranted: false,
      legalTruthVerified: false,
    },
    createdAt: revision === 1 ? "2026-08-23T04:04:00.000Z" : "2026-08-23T04:05:00.000Z",
  };
}

function repositories() {
  const database = new DatabaseSync(":memory:");
  const assignments = new SqliteAiKnowledgeAssignmentRepository(database);
  assignments.saveInstructionSet(instructionSet);
  assignments.saveAssignment(root);
  assignments.saveAssignment(evidence);
  assignments.saveAssignment(deadline);
  return {
    database,
    assignments,
    graphs: new SqliteAiAssignmentGraphRepository(database),
  };
}

describe("SqliteAiAssignmentGraphRepository", () => {
  it("persists immutable sequential graph revisions without granting execution authority", () => {
    const { graphs } = repositories();
    const first = graphs.saveGraph(graph(1));
    const second = graphs.saveGraph(graph(2));

    expect(first.boundaries.executionAuthorityGranted).toBe(false);
    expect(second.revision).toBe(2);
    expect(graphs.getLatestGraph(first.graphId)).toEqual(second);
    expect(graphs.listLatestGraphsByScope({ jurisdiction: "US", domain: "TRADEMARK" })).toEqual([
      second,
    ]);
  });

  it("rejects mutation of an existing graph revision", () => {
    const { graphs } = repositories();
    graphs.saveGraph(graph(1));
    const changed = { ...graph(1), title: "Mutated title" };
    expect(() => graphs.saveGraph(changed)).toThrowError(/already exists with different content/u);
  });

  it("rejects revision gaps", () => {
    const { graphs } = repositories();
    expect(() => graphs.saveGraph(graph(2))).toThrowError(/must begin at revision 1/u);
    graphs.saveGraph(graph(1));
    expect(() => graphs.saveGraph({ ...graph(2), revision: 3 })).toThrowError(
      /must advance from revision 1 to 2/u,
    );
  });

  it("rejects graphs that reference assignments outside the graph scope", () => {
    const { assignments, graphs } = repositories();
    const foreign = {
      ...assignment(
        "kas_ca_trademark_declaration_use",
        "DECLARATION_OF_USE_CA",
        "2026-08-23T04:03:30.000Z",
      ),
      jurisdiction: "CA",
    };
    assignments.saveAssignment(foreign);
    const invalid = graph(1);
    invalid.nodes.push({ assignmentId: foreign.assignmentId, role: "FOLLOW_UP" });
    invalid.edges.push({
      fromAssignmentId: root.assignmentId,
      toAssignmentId: foreign.assignmentId,
      relation: "SUPPORTS",
    });
    expect(() => graphs.saveGraph(invalid)).toThrowError(/outside graph scope/u);
  });

  it("survives repository restart over the same SQLite database", () => {
    const { database, graphs } = repositories();
    const saved = graphs.saveGraph(graph(1));
    const reloaded = new SqliteAiAssignmentGraphRepository(database);
    expect(reloaded.getGraph(saved.graphId, 1)).toEqual(saved);
  });
});
