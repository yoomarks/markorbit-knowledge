import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type {
  AiAssignmentCandidateV1,
  AiAssignmentGraphV1,
  AiInstructionSetV1,
  AiKnowledgeAssignmentV1,
} from "@markorbit/contracts";
import { SqliteAiKnowledgeAssignmentRepository } from "./ai-knowledge-assignment-registry";
import { SqliteAiAssignmentGraphRepository } from "./ai-assignment-graph-registry";
import { SqliteAiAssignmentCandidateRepository } from "./ai-assignment-candidate-registry";

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
  createdAt: "2026-08-23T04:00:00.000Z",
  changeReason: "Initial governed research instruction set.",
  triggerEvidenceRefs: [],
};

const rootAssignment: AiKnowledgeAssignmentV1 = {
  protocolVersion: "1.0",
  objectType: "AI_KNOWLEDGE_ASSIGNMENT",
  assignmentId: "kas_us_trademark_declaration_use",
  jurisdiction: "US",
  domain: "TRADEMARK",
  topic: "DECLARATION_OF_USE",
  title: "US trademark declaration of use",
  instructionSetId: instructionSet.instructionSetId,
  instructionSetRevision: 1,
  language: "zh-CN",
  prompt: "Research US trademark declaration of use in Markdown.",
  createdAt: "2026-08-23T04:01:00.000Z",
};

const graph: AiAssignmentGraphV1 = {
  protocolVersion: "1.0",
  objectType: "AI_ASSIGNMENT_GRAPH",
  graphId: "kag_us_trademark_declaration_use",
  revision: 1,
  title: "US trademark declaration of use research graph",
  jurisdiction: "US",
  domain: "TRADEMARK",
  rootAssignmentIds: [rootAssignment.assignmentId],
  nodes: [{ assignmentId: rootAssignment.assignmentId, role: "ROOT" }],
  edges: [],
  changeReason: "Initial governed topology.",
  triggerEvidenceRefs: [],
  boundaries: {
    executionAuthorityGranted: false,
    legalTruthVerified: false,
  },
  createdAt: "2026-08-23T04:02:00.000Z",
};

function candidate(candidateId = "kac_us_trademark_specimen_evidence"): AiAssignmentCandidateV1 {
  return {
    protocolVersion: "1.0",
    objectType: "AI_ASSIGNMENT_CANDIDATE",
    candidateId,
    graphId: graph.graphId,
    graphRevision: 1,
    parentAssignmentId: rootAssignment.assignmentId,
    suggestedRelation: "DECOMPOSES",
    jurisdiction: "US",
    domain: "TRADEMARK",
    topic: "SPECIMEN_EVIDENCE",
    title: "What evidence qualifies as an acceptable specimen?",
    instructionSetId: instructionSet.instructionSetId,
    instructionSetRevision: 1,
    language: "zh-CN",
    proposedPrompt: "Research acceptable specimen evidence for this declaration procedure.",
    discoveryMethod: "EVIDENCE_GAP",
    evidence: [
      {
        evidenceRef: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        evidenceClass: "OFFICIAL",
        sha256: "a".repeat(64),
        rationale: "Official material identifies specimen evidence as a separate procedural issue.",
      },
    ],
    status: "PROPOSED",
    boundaries: {
      activationAuthorized: false,
      executionAuthorityGranted: false,
      legalTruthVerified: false,
      recursiveAutoExecution: false,
    },
    createdAt: "2026-08-23T04:03:00.000Z",
  };
}

function repositories() {
  const database = new DatabaseSync(":memory:");
  const assignments = new SqliteAiKnowledgeAssignmentRepository(database);
  assignments.saveInstructionSet(instructionSet);
  assignments.saveAssignment(rootAssignment);
  const graphs = new SqliteAiAssignmentGraphRepository(database);
  graphs.saveGraph(graph);
  return {
    database,
    assignments,
    graphs,
    candidates: new SqliteAiAssignmentCandidateRepository(database),
  };
}

describe("SqliteAiAssignmentCandidateRepository", () => {
  it("persists an evidence-backed proposal without activation or execution authority", () => {
    const { candidates } = repositories();
    const saved = candidates.saveCandidate(candidate());

    expect(saved.status).toBe("PROPOSED");
    expect(saved.evidence).toHaveLength(1);
    expect(saved.boundaries.activationAuthorized).toBe(false);
    expect(saved.boundaries.executionAuthorityGranted).toBe(false);
    expect(saved.boundaries.recursiveAutoExecution).toBe(false);
    expect(candidates.listByGraph(graph.graphId, 1)).toEqual([saved]);
  });

  it("rejects mutation of a persisted candidate", () => {
    const { candidates } = repositories();
    const original = candidate();
    candidates.saveCandidate(original);
    expect(() =>
      candidates.saveCandidate({ ...original, title: "Mutated candidate title" }),
    ).toThrowError(/already exists with different content/u);
  });

  it("deduplicates equivalent candidate proposals even when candidate ids differ", () => {
    const { candidates } = repositories();
    candidates.saveCandidate(candidate());
    expect(() =>
      candidates.saveCandidate(candidate("kac_us_trademark_specimen_duplicate")),
    ).toThrowError(/Equivalent Assignment Candidate already exists/u);
  });

  it("rejects a candidate whose parent is not in the bound graph revision", () => {
    const { assignments, candidates } = repositories();
    const outside: AiKnowledgeAssignmentV1 = {
      ...rootAssignment,
      assignmentId: "kas_us_trademark_outside_graph",
      topic: "OUTSIDE_GRAPH",
      title: "Outside graph",
      prompt: "Research a question outside the current graph.",
      createdAt: "2026-08-23T04:02:30.000Z",
    };
    assignments.saveAssignment(outside);
    expect(() =>
      candidates.saveCandidate({ ...candidate(), parentAssignmentId: outside.assignmentId }),
    ).toThrowError(/is not a node/u);
  });

  it("rejects candidate scope drift from the bound graph", () => {
    const { candidates } = repositories();
    expect(() =>
      candidates.saveCandidate({ ...candidate(), jurisdiction: "CA" }),
    ).toThrowError(/does not match Assignment Graph scope/u);
  });

  it("survives repository restart over the same SQLite database", () => {
    const { database, candidates } = repositories();
    const saved = candidates.saveCandidate(candidate());
    const reloaded = new SqliteAiAssignmentCandidateRepository(database);
    expect(reloaded.getCandidate(saved.candidateId)).toEqual(saved);
  });
});
