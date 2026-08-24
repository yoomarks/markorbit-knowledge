import type { DatabaseSync } from "node:sqlite";
import { SqliteAiKnowledgeAssignmentRepository } from "@markorbit/persistence/ai-knowledge-assignments";
import { SqliteAiSourcePackRepository } from "@markorbit/persistence/ai-source-packs";
import {
  prepareAiGroundedExecutionV1,
  type PreparedAiGroundedExecutionV1,
} from "@markorbit/worker-runtime/ai-grounded-execution-preparer";
import type {
  AiSourceSnapshotResolver,
  RenderAiGroundedProviderInputOptions,
} from "@markorbit/worker-runtime/ai-source-pack-renderer";

export class PersistedAiGroundedExecutionPreparationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PersistedAiGroundedExecutionPreparationError";
  }
}

export async function preparePersistedAiGroundedExecutionV1(input: {
  database: DatabaseSync;
  bindingId: string;
  resolver: AiSourceSnapshotResolver;
  preparedAt?: string;
  rendererOptions?: RenderAiGroundedProviderInputOptions;
}): Promise<PreparedAiGroundedExecutionV1> {
  const sourcePacks = new SqliteAiSourcePackRepository(input.database);
  const assignments = new SqliteAiKnowledgeAssignmentRepository(input.database);
  const binding = sourcePacks.getBinding(input.bindingId);
  if (!binding) {
    throw new PersistedAiGroundedExecutionPreparationError(
      "AI_GROUNDED_BINDING_NOT_FOUND",
      `Grounded execution binding ${input.bindingId} was not found`,
    );
  }

  const assignment = assignments.getAssignment(binding.assignmentId);
  if (!assignment) {
    throw new PersistedAiGroundedExecutionPreparationError(
      "AI_GROUNDED_ASSIGNMENT_NOT_FOUND",
      `Grounded execution assignment ${binding.assignmentId} was not found`,
    );
  }

  const sourcePack = sourcePacks.getSourcePack(binding.sourcePackId, binding.sourcePackRevision);
  if (!sourcePack) {
    throw new PersistedAiGroundedExecutionPreparationError(
      "AI_GROUNDED_SOURCE_PACK_NOT_FOUND",
      `Grounded execution source pack ${binding.sourcePackId}@${binding.sourcePackRevision} was not found`,
    );
  }

  return prepareAiGroundedExecutionV1({
    assignment,
    binding,
    sourcePack,
    resolver: input.resolver,
    ...(input.preparedAt ? { preparedAt: input.preparedAt } : {}),
    ...(input.rendererOptions ? { rendererOptions: input.rendererOptions } : {}),
  });
}
