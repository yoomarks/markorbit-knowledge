import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type {
  AiAssignmentCandidateV1,
  AiAssignmentGraphV1,
  AiAssignmentLibraryV1,
  AiInstructionSetV1,
  AiKnowledgeAssignmentV1,
} from "@markorbit/contracts";
import { SqliteAiAssignmentCandidateRepository } from "./ai-assignment-candidate-registry";
import {
  promoteAiAssignmentCandidate,
  SqliteAiAssignmentCandidatePromotionRepository,
  type PromoteAiAssignmentCandidateInput,
} from "./ai-assignment-candidate-promotion";
import { SqliteAiAssignmentGraphRepository } from "./ai-assignment-graph-registry";
import { SqliteAiAssignmentLibraryRepository } from "./ai-assignment-library-registry";
import { SqliteAiKnowledgeAssignmentRepository } from "./ai-knowledge-assignment-registry";

const instructionSet: AiInstructionSetV1 = {
  protocolVersion: "1.0",
  objectType: "AI_INSTRUCTION_SET",
  instructionSetId: "kis_us_trademark_growth",
  revision: 1,
  name: "US trademark governed growth",
  purpose: "Research approved follow-up propositions without granting execution authority.",
  stableInstructions: ["Use source-grounded Markdown.", "Do not certify legal truth."],
  requiredSections: ["Scope", "Authority", "Procedure"],
  outputFormat: "MARKDOWN",
  createdAt: "2026-08-24T01:00:00.000Z",
  changeReason: "ADK-09 promotion test fixture",
  triggerEvidenceRefs: [],
};

const rootAssignment: AiKnowledgeAssignmentV1 = {
  protocolVersion: "1.0",
  objectType: "AI_KNOWLEDGE_ASSIGNMENT",
  assignmentId: "kas_us_trademark_maintenance_root",
  jurisdiction: "US",
  domain: "TRADEMARK",
  topic: "MAINTENANCE",
  title: "US trademark maintenance",
  instructionSetId: instructionSet.instructionSetId,
  instructionSetRevision: 1,
  language: "en",
  prompt: "Research the governed US trademark maintenance lifecycle.",
  createdAt: "2026-08-24T01:01:00.000Z",
};

const graph: AiAssignmentGraphV1 = {
  protocolVersion: "1.0",
  objectType: "AI_ASSIGNMENT_GRAPH",
  graphId: "kag_us_trademark_maintenance",
  revision: 1,
  title: "US trademark maintenance proposition graph",
  jurisdiction: "US",
  domain: "TRADEMARK",
  rootAssignmentIds: [rootAssignment.assignmentId],
  nodes: [{ assignmentId: rootAssignment.assignmentId, role: "ROOT" }],
  edges: [],
  changeReason: "Initial governed topology",
  triggerEvidenceRefs: [],
  boundaries: {
    executionAuthorityGranted: false,
    legalTruthVerified: false,
  },
  createdAt: "2026-08-24T01:02:00.000Z",
};

const library: AiAssignmentLibraryV1 = {
  protocolVersion: "1.0",
  objectType: "AI_ASSIGNMENT_LIBRARY",
  libraryId: "kal_us_trademark_growth",
  revision: 1,
  title: "US trademark governed growth library",
  jurisdiction: "US",
  domain: "TRADEMARK",
  entries: [
    {
      sequence: 1,
      workflow: "MAINTENANCE",
      assignmentId: rootAssignment.assignmentId,
      tags: ["maintenance"],
    },
  ],
  boundaries: {
    answerContentStored: false,
    executionAuthorityGranted: false,
    legalTruthVerified: false,
    candidateAutoActivation: false,
  },
  createdAt: "2026-08-24T01:02:30.000Z",
  changeReason: "Initial governed library",
};

const candidate: AiAssignmentCandidateV1 = {
  protocolVersion: "1.0",
  objectType: "AI_ASSIGNMENT_CANDIDATE",
  candidateId: "kac_us_trademark_maintenance_grace_window",
  graphId: graph.graphId,
  graphRevision: graph.revision,
  parentAssignmentId: rootAssignment.assignmentId,
  suggestedRelation: "DECOMPOSES",
  jurisdiction: "US",
  domain: "TRADEMARK",
  topic: "MAINTENANCE_GRACE_WINDOW",
  title: "How do maintenance grace windows operate?",
  instructionSetId: instructionSet.instructionSetId,
  instructionSetRevision: instructionSet.revision,
  language: "en",
  proposedPrompt:
    "Research the current grace-window rules, fees, consequences and official sources for US trademark maintenance filings.",
  discoveryMethod: "EVIDENCE_GAP",
  evidence: [
    {
      evidenceRef: "art_uspto_maintenance_grace_window",
      evidenceClass: "OFFICIAL",
      sha256: "a".repeat(64),
      rationale: "Official evidence exposes a distinct maintenance timing branch.",
    },
  ],
  status: "PROPOSED",
  boundaries: {
    activationAuthorized: false,
    executionAuthorityGranted: false,
    legalTruthVerified: false,
    recursiveAutoExecution: false,
  },
  createdAt: "2026-08-24T01:03:00.000Z",
};

const promotionInput: PromoteAiAssignmentCandidateInput = {
  promotionId: "kap_us_trademark_maintenance_grace_window",
  candidateId: candidate.candidateId,
  approvalRef: "approval/adk-09/maintenance-grace-window",
  approvedBy: "knowledge-operator",
  targetAssignmentId: "kas_us_trademark_maintenance_grace_window",
  libraryId: library.libraryId,
  baseLibraryRevision: library.revision,
  workflow: "MAINTENANCE",
  tags: ["maintenance", "deadline", "grace-window"],
  promotedAt: "2026-08-24T01:04:00.000Z",
};

function setup() {
  const database = new DatabaseSync(":memory:");
  const assignments = new SqliteAiKnowledgeAssignmentRepository(database);
  assignments.saveInstructionSet(instructionSet);
  assignments.saveAssignment(rootAssignment);

  const graphs = new SqliteAiAssignmentGraphRepository(database);
  graphs.saveGraph(graph);

  const libraries = new SqliteAiAssignmentLibraryRepository(database);
  libraries.saveLibrary(library);

  const candidates = new SqliteAiAssignmentCandidateRepository(database);
  candidates.saveCandidate(candidate);

  return { database, assignments, graphs, libraries, candidates };
}

describe("governed Assignment Candidate promotion", () => {
  it("promotes an approved evidence-backed candidate into Assignment, graph and library revisions", () => {
    const { database, assignments, graphs, libraries } = setup();

    const result = promoteAiAssignmentCandidate(database, promotionInput);

    expect(result.assignment.assignmentId).toBe(promotionInput.targetAssignmentId);
    expect(result.assignment.prompt).toBe(candidate.proposedPrompt);
    expect(result.graph.revision).toBe(2);
    expect(result.graph.nodes.at(-1)).toEqual({
      assignmentId: promotionInput.targetAssignmentId,
      role: "FOLLOW_UP",
    });
    expect(result.graph.edges.at(-1)).toEqual({
      fromAssignmentId: rootAssignment.assignmentId,
      toAssignmentId: promotionInput.targetAssignmentId,
      relation: candidate.suggestedRelation,
    });
    expect(result.graph.triggerEvidenceRefs).toContain(candidate.evidence[0].evidenceRef);
    expect(result.library.revision).toBe(2);
    expect(result.library.entries.at(-1)).toEqual({
      sequence: 2,
      workflow: "MAINTENANCE",
      assignmentId: promotionInput.targetAssignmentId,
      tags: promotionInput.tags,
    });
    expect(result.promotion.approvalRef).toBe(promotionInput.approvalRef);
    expect(result.promotion.boundaries.automaticApproval).toBe(false);
    expect(result.promotion.boundaries.executionAuthorityGranted).toBe(false);
    expect(result.promotion.boundaries.legalTruthVerified).toBe(false);

    expect(assignments.getAssignment(promotionInput.targetAssignmentId)).toEqual(result.assignment);
    expect(graphs.getLatestGraph(graph.graphId)).toEqual(result.graph);
    expect(libraries.getLatestLibrary(library.libraryId)).toEqual(result.library);
    expect(
      new SqliteAiAssignmentCandidatePromotionRepository(database).getByCandidateId(
        candidate.candidateId,
      ),
    ).toEqual(result.promotion);
  });

  it("is idempotent for an exact approved promotion replay", () => {
    const { database } = setup();

    const first = promoteAiAssignmentCandidate(database, promotionInput);
    const second = promoteAiAssignmentCandidate(database, promotionInput);

    expect(second).toEqual(first);
  });

  it("recovers exact durable intermediate writes from the same frozen plan", () => {
    const { database, assignments, graphs, libraries } = setup();
    const assignment: AiKnowledgeAssignmentV1 = {
      protocolVersion: "1.0",
      objectType: "AI_KNOWLEDGE_ASSIGNMENT",
      assignmentId: promotionInput.targetAssignmentId,
      jurisdiction: candidate.jurisdiction,
      domain: candidate.domain,
      topic: candidate.topic,
      title: candidate.title,
      instructionSetId: candidate.instructionSetId,
      instructionSetRevision: candidate.instructionSetRevision,
      language: candidate.language,
      prompt: candidate.proposedPrompt,
      createdAt: promotionInput.promotedAt,
    };
    assignments.saveAssignment(assignment);
    graphs.saveGraph({
      ...graph,
      revision: 2,
      nodes: [...graph.nodes, { assignmentId: assignment.assignmentId, role: "FOLLOW_UP" }],
      edges: [
        {
          fromAssignmentId: candidate.parentAssignmentId,
          toAssignmentId: assignment.assignmentId,
          relation: candidate.suggestedRelation,
        },
      ],
      changeReason: `Promote ${candidate.candidateId} under approval ${promotionInput.approvalRef}`,
      triggerEvidenceRefs: [candidate.evidence[0].evidenceRef],
      createdAt: promotionInput.promotedAt,
    });
    libraries.saveLibrary({
      ...library,
      revision: 2,
      entries: [
        ...library.entries,
        {
          sequence: 2,
          workflow: promotionInput.workflow,
          assignmentId: assignment.assignmentId,
          tags: [...promotionInput.tags],
        },
      ],
      changeReason: `Promote ${candidate.candidateId} under approval ${promotionInput.approvalRef}`,
      createdAt: promotionInput.promotedAt,
    });

    const recovered = promoteAiAssignmentCandidate(database, promotionInput);

    expect(recovered.assignment).toEqual(assignment);
    expect(recovered.graph.revision).toBe(2);
    expect(recovered.library.revision).toBe(2);
    expect(
      new SqliteAiAssignmentCandidatePromotionRepository(database).getByCandidateId(
        candidate.candidateId,
      ),
    ).toEqual(recovered.promotion);
  });

  it("refuses to reinterpret an already promoted candidate under a different approval", () => {
    const { database } = setup();
    promoteAiAssignmentCandidate(database, promotionInput);

    expect(() =>
      promoteAiAssignmentCandidate(database, {
        ...promotionInput,
        approvalRef: "approval/adk-09/different-decision",
      }),
    ).toThrowError(/already promoted differently/u);
  });

  it("refuses stale graph candidates after the governed topology advances", () => {
    const { database, assignments, graphs } = setup();
    const unrelated: AiKnowledgeAssignmentV1 = {
      ...rootAssignment,
      assignmentId: "kas_us_trademark_unrelated_follow_up",
      topic: "UNRELATED_FOLLOW_UP",
      title: "Unrelated follow-up",
      prompt: "Research an unrelated governed follow-up.",
      createdAt: "2026-08-24T01:03:30.000Z",
    };
    assignments.saveAssignment(unrelated);
    graphs.saveGraph({
      ...graph,
      revision: 2,
      nodes: [...graph.nodes, { assignmentId: unrelated.assignmentId, role: "FOLLOW_UP" }],
      edges: [
        {
          fromAssignmentId: rootAssignment.assignmentId,
          toAssignmentId: unrelated.assignmentId,
          relation: "SUPPORTS",
        },
      ],
      changeReason: "Advance graph before candidate promotion",
      createdAt: "2026-08-24T01:03:40.000Z",
    });

    expect(() => promoteAiAssignmentCandidate(database, promotionInput)).toThrowError(
      /targets stale graph/u,
    );
  });

  it("refuses stale library approvals instead of silently appending to a newer revision", () => {
    const { database, assignments, libraries } = setup();
    const additional: AiKnowledgeAssignmentV1 = {
      ...rootAssignment,
      assignmentId: "kas_us_trademark_library_only_addition",
      topic: "LIBRARY_ONLY_ADDITION",
      title: "Library-only governed addition",
      prompt: "Research another governed maintenance proposition.",
      createdAt: "2026-08-24T01:03:35.000Z",
    };
    assignments.saveAssignment(additional);
    libraries.saveLibrary({
      ...library,
      revision: 2,
      entries: [
        ...library.entries,
        {
          sequence: 2,
          workflow: "MAINTENANCE",
          assignmentId: additional.assignmentId,
          tags: ["maintenance", "additional"],
        },
      ],
      changeReason: "Advance library before promotion",
      createdAt: "2026-08-24T01:03:45.000Z",
    });

    expect(() => promoteAiAssignmentCandidate(database, promotionInput)).toThrowError(
      /requires latest library/u,
    );
  });

  it("rejects scope drift between the candidate and target library", () => {
    const { database, assignments, libraries } = setup();
    const caAssignment: AiKnowledgeAssignmentV1 = {
      ...rootAssignment,
      assignmentId: "kas_ca_trademark_maintenance_root",
      jurisdiction: "CA",
      createdAt: "2026-08-24T01:03:20.000Z",
    };
    assignments.saveAssignment(caAssignment);
    libraries.saveLibrary({
      ...library,
      libraryId: "kal_ca_trademark_growth",
      jurisdiction: "CA",
      entries: [
        {
          sequence: 1,
          workflow: "MAINTENANCE",
          assignmentId: caAssignment.assignmentId,
          tags: ["maintenance"],
        },
      ],
    });

    expect(() =>
      promoteAiAssignmentCandidate(database, {
        ...promotionInput,
        libraryId: "kal_ca_trademark_growth",
      }),
    ).toThrowError(/must share one jurisdiction\/domain scope/u);
  });
});
