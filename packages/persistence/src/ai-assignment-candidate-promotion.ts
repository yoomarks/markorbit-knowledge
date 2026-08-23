import { DatabaseSync } from "node:sqlite";
import {
  AI_ASSIGNMENT_CANDIDATE_PROMOTION_OBJECT_TYPE,
  AI_ASSIGNMENT_CANDIDATE_PROMOTION_PROTOCOL_VERSION,
  AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION,
  AI_KNOWLEDGE_ASSIGNMENT_OBJECT_TYPE,
  isAiAssignmentCandidatePromotionV1,
  type AiAssignmentCandidatePromotionV1,
  type AiAssignmentGraphV1,
  type AiAssignmentLibraryV1,
  type AiKnowledgeAssignmentV1,
} from "@markorbit/contracts";
import { SqliteAiAssignmentCandidateRepository } from "./ai-assignment-candidate-registry";
import { SqliteAiAssignmentGraphRepository } from "./ai-assignment-graph-registry";
import { SqliteAiAssignmentLibraryRepository } from "./ai-assignment-library-registry";
import { SqliteAiKnowledgeAssignmentRepository } from "./ai-knowledge-assignment-registry";
import { RegistryConflictError, RegistryValidationError } from "./index";

const INITIALIZED_DATABASES = new WeakSet<DatabaseSync>();

export type PromoteAiAssignmentCandidateInput = {
  promotionId: string;
  candidateId: string;
  approvalRef: string;
  approvedBy: string;
  targetAssignmentId: string;
  libraryId: string;
  baseLibraryRevision: number;
  workflow: string;
  tags: readonly string[];
  promotedAt: string;
};

export type PromoteAiAssignmentCandidateResult = {
  assignment: AiKnowledgeAssignmentV1;
  graph: AiAssignmentGraphV1;
  library: AiAssignmentLibraryV1;
  promotion: AiAssignmentCandidatePromotionV1;
};

export function ensureAiAssignmentCandidatePromotionRegistry(database: DatabaseSync): void {
  if (INITIALIZED_DATABASES.has(database)) return;
  database.exec("PRAGMA foreign_keys = ON;");
  new SqliteAiAssignmentCandidateRepository(database);
  database.exec(`
    CREATE TABLE IF NOT EXISTS ai_assignment_candidate_promotions (
      promotion_id TEXT PRIMARY KEY CHECK (promotion_id LIKE 'kap_%'),
      candidate_id TEXT NOT NULL UNIQUE,
      target_assignment_id TEXT NOT NULL UNIQUE,
      library_id TEXT NOT NULL,
      resulting_library_revision INTEGER NOT NULL CHECK (resulting_library_revision > 1),
      graph_id TEXT NOT NULL,
      resulting_graph_revision INTEGER NOT NULL CHECK (resulting_graph_revision > 1),
      document_json TEXT NOT NULL,
      promoted_at TEXT NOT NULL,
      FOREIGN KEY(candidate_id) REFERENCES ai_assignment_candidates(candidate_id),
      FOREIGN KEY(target_assignment_id) REFERENCES ai_knowledge_assignments(assignment_id),
      FOREIGN KEY(library_id, resulting_library_revision)
        REFERENCES ai_assignment_libraries(library_id, revision),
      FOREIGN KEY(graph_id, resulting_graph_revision)
        REFERENCES ai_assignment_graphs(graph_id, revision)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS ai_assignment_candidate_promotions_scope_idx
      ON ai_assignment_candidate_promotions(library_id, resulting_library_revision, promoted_at);
  `);
  INITIALIZED_DATABASES.add(database);
}

function parsePromotion(value: string): AiAssignmentCandidatePromotionV1 {
  const parsed = JSON.parse(value) as unknown;
  if (!isAiAssignmentCandidatePromotionV1(parsed)) {
    throw new RegistryValidationError("Stored AI Assignment Candidate Promotion is invalid");
  }
  return parsed;
}

function samePromotion(
  existing: AiAssignmentCandidatePromotionV1,
  expected: AiAssignmentCandidatePromotionV1,
): boolean {
  return JSON.stringify(existing) === JSON.stringify(expected);
}

function uniqueEvidenceRefs(refs: readonly string[]): string[] {
  return [...new Set(refs)].sort((left, right) => left.localeCompare(right));
}

export class SqliteAiAssignmentCandidatePromotionRepository {
  constructor(private readonly database: DatabaseSync) {
    ensureAiAssignmentCandidatePromotionRegistry(database);
  }

  savePromotion(value: AiAssignmentCandidatePromotionV1): AiAssignmentCandidatePromotionV1 {
    if (!isAiAssignmentCandidatePromotionV1(value)) {
      throw new RegistryValidationError("AI Assignment Candidate Promotion is invalid");
    }

    const existing = this.getByCandidateId(value.candidateId) ?? this.getPromotion(value.promotionId);
    if (existing) {
      if (!samePromotion(existing, value)) {
        throw new RegistryConflictError(
          "AI_ASSIGNMENT_CANDIDATE_PROMOTION_IMMUTABLE_CONFLICT",
          `Assignment Candidate ${value.candidateId} already has a different promotion receipt`,
        );
      }
      return existing;
    }

    this.database
      .prepare(
        `INSERT INTO ai_assignment_candidate_promotions(
          promotion_id, candidate_id, target_assignment_id,
          library_id, resulting_library_revision,
          graph_id, resulting_graph_revision, document_json, promoted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        value.promotionId,
        value.candidateId,
        value.targetAssignmentId,
        value.libraryId,
        value.resultingLibraryRevision,
        value.graphId,
        value.resultingGraphRevision,
        JSON.stringify(value),
        value.promotedAt,
      );
    return value;
  }

  getPromotion(promotionId: string): AiAssignmentCandidatePromotionV1 | null {
    const row = this.database
      .prepare(
        `SELECT document_json
           FROM ai_assignment_candidate_promotions
          WHERE promotion_id = ?`,
      )
      .get(promotionId) as { document_json: string } | undefined;
    return row ? parsePromotion(row.document_json) : null;
  }

  getByCandidateId(candidateId: string): AiAssignmentCandidatePromotionV1 | null {
    const row = this.database
      .prepare(
        `SELECT document_json
           FROM ai_assignment_candidate_promotions
          WHERE candidate_id = ?`,
      )
      .get(candidateId) as { document_json: string } | undefined;
    return row ? parsePromotion(row.document_json) : null;
  }
}

export function promoteAiAssignmentCandidate(
  database: DatabaseSync,
  input: PromoteAiAssignmentCandidateInput,
): PromoteAiAssignmentCandidateResult {
  const candidates = new SqliteAiAssignmentCandidateRepository(database);
  const assignments = new SqliteAiKnowledgeAssignmentRepository(database);
  const graphs = new SqliteAiAssignmentGraphRepository(database);
  const libraries = new SqliteAiAssignmentLibraryRepository(database);
  const promotions = new SqliteAiAssignmentCandidatePromotionRepository(database);

  const candidate = candidates.getCandidate(input.candidateId);
  if (!candidate) {
    throw new RegistryValidationError(`Assignment Candidate ${input.candidateId} does not exist`);
  }

  const baseGraph = graphs.getLatestGraph(candidate.graphId);
  if (!baseGraph || baseGraph.revision !== candidate.graphRevision) {
    throw new RegistryConflictError(
      "AI_ASSIGNMENT_CANDIDATE_GRAPH_STALE",
      `Assignment Candidate ${candidate.candidateId} targets stale graph ${candidate.graphId}@${candidate.graphRevision}`,
    );
  }

  const baseLibrary = libraries.getLatestLibrary(input.libraryId);
  if (!baseLibrary || baseLibrary.revision !== input.baseLibraryRevision) {
    throw new RegistryConflictError(
      "AI_ASSIGNMENT_CANDIDATE_LIBRARY_STALE",
      `Promotion requires latest library ${input.libraryId}@${input.baseLibraryRevision}`,
    );
  }
  if (
    baseLibrary.jurisdiction !== candidate.jurisdiction ||
    baseLibrary.domain !== candidate.domain ||
    baseGraph.jurisdiction !== candidate.jurisdiction ||
    baseGraph.domain !== candidate.domain
  ) {
    throw new RegistryConflictError(
      "AI_ASSIGNMENT_CANDIDATE_PROMOTION_SCOPE_MISMATCH",
      `Candidate ${candidate.candidateId}, graph and library must share one jurisdiction/domain scope`,
    );
  }
  if (!baseGraph.nodes.some((node) => node.assignmentId === candidate.parentAssignmentId)) {
    throw new RegistryConflictError(
      "AI_ASSIGNMENT_CANDIDATE_PARENT_MISSING",
      `Candidate parent ${candidate.parentAssignmentId} is not present in latest graph`,
    );
  }
  if (baseGraph.nodes.some((node) => node.assignmentId === input.targetAssignmentId)) {
    throw new RegistryConflictError(
      "AI_ASSIGNMENT_CANDIDATE_TARGET_ALREADY_IN_GRAPH",
      `Target Assignment ${input.targetAssignmentId} is already in the graph`,
    );
  }
  if (baseLibrary.entries.some((entry) => entry.assignmentId === input.targetAssignmentId)) {
    throw new RegistryConflictError(
      "AI_ASSIGNMENT_CANDIDATE_TARGET_ALREADY_IN_LIBRARY",
      `Target Assignment ${input.targetAssignmentId} is already in the library`,
    );
  }

  const assignment: AiKnowledgeAssignmentV1 = {
    protocolVersion: AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION,
    objectType: AI_KNOWLEDGE_ASSIGNMENT_OBJECT_TYPE,
    assignmentId: input.targetAssignmentId,
    jurisdiction: candidate.jurisdiction,
    domain: candidate.domain,
    topic: candidate.topic,
    title: candidate.title,
    instructionSetId: candidate.instructionSetId,
    instructionSetRevision: candidate.instructionSetRevision,
    language: candidate.language,
    prompt: candidate.proposedPrompt,
    createdAt: input.promotedAt,
  };

  const graph: AiAssignmentGraphV1 = {
    ...baseGraph,
    revision: baseGraph.revision + 1,
    nodes: [...baseGraph.nodes, { assignmentId: assignment.assignmentId, role: "FOLLOW_UP" }],
    edges: [
      ...baseGraph.edges,
      {
        fromAssignmentId: candidate.parentAssignmentId,
        toAssignmentId: assignment.assignmentId,
        relation: candidate.suggestedRelation,
      },
    ],
    changeReason: `Promote ${candidate.candidateId} under approval ${input.approvalRef}`,
    triggerEvidenceRefs: uniqueEvidenceRefs([
      ...baseGraph.triggerEvidenceRefs,
      ...candidate.evidence.map((entry) => entry.evidenceRef),
    ]),
    createdAt: input.promotedAt,
  };

  const library: AiAssignmentLibraryV1 = {
    ...baseLibrary,
    revision: baseLibrary.revision + 1,
    entries: [
      ...baseLibrary.entries,
      {
        sequence: baseLibrary.entries.length + 1,
        workflow: input.workflow,
        assignmentId: assignment.assignmentId,
        tags: [...input.tags],
      },
    ],
    createdAt: input.promotedAt,
    changeReason: `Promote ${candidate.candidateId} under approval ${input.approvalRef}`,
  };

  const promotion: AiAssignmentCandidatePromotionV1 = {
    protocolVersion: AI_ASSIGNMENT_CANDIDATE_PROMOTION_PROTOCOL_VERSION,
    objectType: AI_ASSIGNMENT_CANDIDATE_PROMOTION_OBJECT_TYPE,
    promotionId: input.promotionId,
    candidateId: candidate.candidateId,
    approvalRef: input.approvalRef,
    approvedBy: input.approvedBy,
    targetAssignmentId: assignment.assignmentId,
    libraryId: library.libraryId,
    baseLibraryRevision: baseLibrary.revision,
    resultingLibraryRevision: library.revision,
    workflow: input.workflow,
    tags: [...input.tags],
    graphId: graph.graphId,
    baseGraphRevision: baseGraph.revision,
    resultingGraphRevision: graph.revision,
    status: "PROMOTED",
    boundaries: {
      automaticApproval: false,
      executionAuthorityGranted: false,
      legalTruthVerified: false,
    },
    promotedAt: input.promotedAt,
  };
  if (!isAiAssignmentCandidatePromotionV1(promotion)) {
    throw new RegistryValidationError("Promotion input does not produce a valid governed receipt");
  }

  const existingPromotion = promotions.getByCandidateId(candidate.candidateId);
  if (existingPromotion) {
    if (!samePromotion(existingPromotion, promotion)) {
      throw new RegistryConflictError(
        "AI_ASSIGNMENT_CANDIDATE_ALREADY_PROMOTED",
        `Assignment Candidate ${candidate.candidateId} was already promoted differently`,
      );
    }
    const existingAssignment = assignments.getAssignment(existingPromotion.targetAssignmentId);
    const existingGraph = graphs.getGraph(existingPromotion.graphId, existingPromotion.resultingGraphRevision);
    const existingLibrary = libraries.getLibrary(
      existingPromotion.libraryId,
      existingPromotion.resultingLibraryRevision,
    );
    if (!existingAssignment || !existingGraph || !existingLibrary) {
      throw new RegistryConflictError(
        "AI_ASSIGNMENT_CANDIDATE_PROMOTION_INCOMPLETE",
        `Promotion ${existingPromotion.promotionId} is missing durable promoted state`,
      );
    }
    return {
      assignment: existingAssignment,
      graph: existingGraph,
      library: existingLibrary,
      promotion: existingPromotion,
    };
  }

  assignments.saveAssignment(assignment);
  graphs.saveGraph(graph);
  libraries.saveLibrary(library);
  promotions.savePromotion(promotion);

  return { assignment, graph, library, promotion };
}
