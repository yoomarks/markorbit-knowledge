import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  promoteAiAssignmentCandidate,
  type PromoteAiAssignmentCandidateInput,
} from "@markorbit/persistence/ai-assignment-candidate-promotions";

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function loadAdkCandidatePromotionConfig(environment: NodeJS.ProcessEnv = process.env): {
  databasePath: string;
  planPath: string;
} {
  return {
    databasePath: resolve(required(environment, "MARKORBIT_ADK_LIBRARY_DB_PATH")),
    planPath: resolve(required(environment, "MARKORBIT_ADK_PROMOTION_PLAN_PATH")),
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseAdkCandidatePromotionPlan(value: unknown): PromoteAiAssignmentCandidateInput {
  const item = record(value);
  const expected = [
    "promotionId",
    "candidateId",
    "approvalRef",
    "approvedBy",
    "targetAssignmentId",
    "libraryId",
    "baseLibraryRevision",
    "workflow",
    "tags",
    "promotedAt",
  ];
  if (
    !item ||
    Object.keys(item).length !== expected.length ||
    !expected.every((key) => key in item) ||
    !nonEmpty(item.promotionId) ||
    !nonEmpty(item.candidateId) ||
    !nonEmpty(item.approvalRef) ||
    !nonEmpty(item.approvedBy) ||
    !nonEmpty(item.targetAssignmentId) ||
    !nonEmpty(item.libraryId) ||
    !Number.isSafeInteger(item.baseLibraryRevision) ||
    (item.baseLibraryRevision as number) <= 0 ||
    !nonEmpty(item.workflow) ||
    !Array.isArray(item.tags) ||
    item.tags.length === 0 ||
    !item.tags.every(nonEmpty) ||
    !nonEmpty(item.promotedAt) ||
    Number.isNaN(Date.parse(item.promotedAt))
  ) {
    throw new TypeError("Invalid ADK candidate promotion plan");
  }

  return {
    promotionId: item.promotionId,
    candidateId: item.candidateId,
    approvalRef: item.approvalRef,
    approvedBy: item.approvedBy,
    targetAssignmentId: item.targetAssignmentId,
    libraryId: item.libraryId,
    baseLibraryRevision: item.baseLibraryRevision as number,
    workflow: item.workflow,
    tags: item.tags as string[],
    promotedAt: item.promotedAt,
  };
}

async function main(): Promise<void> {
  const config = loadAdkCandidatePromotionConfig();
  const plan = parseAdkCandidatePromotionPlan(
    JSON.parse(readFileSync(config.planPath, "utf8")) as unknown,
  );
  const database = new DatabaseSync(config.databasePath);
  database.exec("PRAGMA foreign_keys = ON;");

  try {
    const result = promoteAiAssignmentCandidate(database, plan);
    process.stdout.write(
      `${JSON.stringify(
        {
          event: "adk.assignment-candidate.promotion.completed",
          databasePath: config.databasePath,
          planPath: config.planPath,
          promotionId: result.promotion.promotionId,
          candidateId: result.promotion.candidateId,
          approvalRef: result.promotion.approvalRef,
          targetAssignmentId: result.assignment.assignmentId,
          graph: {
            graphId: result.graph.graphId,
            revision: result.graph.revision,
          },
          library: {
            libraryId: result.library.libraryId,
            revision: result.library.revision,
            workflow: result.promotion.workflow,
          },
          boundaries: result.promotion.boundaries,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    database.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        event: "adk.assignment-candidate.promotion.failed",
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}
