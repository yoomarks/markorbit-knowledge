export const AI_EVIDENCE_PLANE_OWNER_CLASSES = [
  "KEEP-IN-KNOWLEDGE",
  "ADAPTER",
  "DEPRECATE",
  "MOVE-TO-BRAIN",
] as const;

export type AiEvidencePlaneOwnerClassV1 = (typeof AI_EVIDENCE_PLANE_OWNER_CLASSES)[number];

export type AiEvidencePlaneOwnerEntryV1 = {
  modulePath: string;
  classification: AiEvidencePlaneOwnerClassV1;
};

const KEEP_IN_KNOWLEDGE = [
  "packages/contracts/src/ai-acquisition-evidence-v1.ts",
  "packages/contracts/src/ai-evidence-plane-owner-map-v1.ts",
  "packages/contracts/src/ai-grounded-prepared-evidence-v1.ts",
  "packages/contracts/src/ai-grounded-provider-authorization-v1.ts",
  "packages/contracts/src/ai-grounded-validation-v1.ts",
  "packages/contracts/src/ai-production-pilot-v1.ts",
  "packages/worker-runtime/src/ai-grounded-output-validator.ts",
  "packages/persistence/src/ai-grounded-prepared-execution-evidence.ts",
  "packages/persistence/src/ai-grounded-prepared-execution-ingestion.ts",
  "packages/persistence/src/ai-grounded-provider-authorization-registry.ts",
  "packages/persistence/src/ai-grounded-validation-evidence.ts",
  "apps/worker/src/adk-live-pilot-acceptance.ts",
  "apps/worker/src/adk-live-pilot-resume.ts",
  "apps/worker/src/adk-live-pilot-runtime-secret.ts",
  "apps/worker/src/persist-adk-grounded-prepared-execution.ts",
] as const;

const ADAPTER = [
  "packages/contracts/src/ai-grounded-execution-v1.ts",
  "packages/contracts/src/ai-source-pack-v1.ts",
  "packages/worker-runtime/src/ai-distilled-knowledge-acquirer.ts",
  "packages/worker-runtime/src/ai-grounded-execution-preparer.ts",
  "packages/worker-runtime/src/ai-production-pilot.ts",
  "packages/worker-runtime/src/managed-ai-capability-http-adapter.ts",
  "packages/worker-runtime/src/managed-ai-execution-http-client.ts",
  "packages/worker-runtime/src/managed-ai-knowledge-adapter.ts",
  "packages/worker-runtime/src/managed-ai-knowledge-http-adapter.ts",
  "packages/worker-runtime/src/openai-knowledge-adapter.ts",
  "packages/persistence/src/ai-source-pack-registry.ts",
  "apps/worker/src/adk-deepseek-provider.ts",
  "apps/worker/src/adk-grounded-queue-admission.ts",
  "apps/worker/src/adk-knowledge-job-queue-store.ts",
  "apps/worker/src/adk-knowledge-job-queue.ts",
  "apps/worker/src/adk-knowledge-job-worker.ts",
  "apps/worker/src/adk-live-pilot-plan.ts",
  "apps/worker/src/prepare-adk-grounded-execution.ts",
  "apps/worker/src/prepare-adk-live-pilot-runtime.ts",
  "apps/worker/src/run-adk-grounded-queue-enqueue.ts",
  "apps/worker/src/run-adk-live-pilot.ts",
  "apps/worker/src/run-adk-queue-enqueue.ts",
  "apps/worker/src/run-adk-queue-recover.ts",
  "apps/worker/src/run-adk-queue-worker.ts",
] as const;

const DEPRECATE = [
  "packages/contracts/src/ai-distilled-knowledge-v1.ts",
  "packages/persistence/src/ai-distilled-knowledge-ingestion.ts",
] as const;

const MOVE_TO_BRAIN = [
  "packages/contracts/src/ai-assignment-candidate-promotion-v1.ts",
  "packages/contracts/src/ai-assignment-candidate-v1.ts",
  "packages/contracts/src/ai-assignment-graph-v1.ts",
  "packages/contracts/src/ai-assignment-library-v1.ts",
  "packages/worker-runtime/src/ai-source-pack-renderer.ts",
  "packages/persistence/src/ai-assignment-candidate-promotion.ts",
  "packages/persistence/src/ai-assignment-candidate-registry.ts",
  "packages/persistence/src/ai-assignment-graph-registry.ts",
  "packages/persistence/src/ai-assignment-library-registry.ts",
  "packages/persistence/src/ai-knowledge-assignment-registry.ts",
  "apps/worker/src/run-adk-assignment-library-bootstrap.ts",
  "apps/worker/src/run-adk-candidate-promotion.ts",
] as const;

function entries(
  classification: AiEvidencePlaneOwnerClassV1,
  paths: readonly string[],
): AiEvidencePlaneOwnerEntryV1[] {
  return paths.map((modulePath) => ({ modulePath, classification }));
}

export const AI_EVIDENCE_PLANE_OWNER_MAP_V1: readonly AiEvidencePlaneOwnerEntryV1[] = [
  ...entries("KEEP-IN-KNOWLEDGE", KEEP_IN_KNOWLEDGE),
  ...entries("ADAPTER", ADAPTER),
  ...entries("DEPRECATE", DEPRECATE),
  ...entries("MOVE-TO-BRAIN", MOVE_TO_BRAIN),
];

export function aiEvidencePlaneOwnerClassFor(
  modulePath: string,
): AiEvidencePlaneOwnerClassV1 | undefined {
  return AI_EVIDENCE_PLANE_OWNER_MAP_V1.find((entry) => entry.modulePath === modulePath)
    ?.classification;
}
