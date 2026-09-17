import { describe, expect, it } from "vitest";
import {
  AI_EVIDENCE_PLANE_OWNER_MAP_V1,
  aiEvidencePlaneOwnerClassFor,
} from "./ai-evidence-plane-owner-map-v1";

const EXPECTED_PRODUCTION_AI_MODULES = [
  "apps/worker/src/adk-deepseek-provider.ts",
  "apps/worker/src/adk-grounded-queue-admission.ts",
  "apps/worker/src/adk-knowledge-job-queue-store.ts",
  "apps/worker/src/adk-knowledge-job-queue.ts",
  "apps/worker/src/adk-knowledge-job-worker.ts",
  "apps/worker/src/adk-live-pilot-acceptance.ts",
  "apps/worker/src/adk-live-pilot-plan.ts",
  "apps/worker/src/adk-live-pilot-resume.ts",
  "apps/worker/src/adk-live-pilot-runtime-secret.ts",
  "apps/worker/src/persist-adk-grounded-prepared-execution.ts",
  "apps/worker/src/prepare-adk-grounded-execution.ts",
  "apps/worker/src/prepare-adk-live-pilot-runtime.ts",
  "apps/worker/src/run-adk-assignment-library-bootstrap.ts",
  "apps/worker/src/run-adk-candidate-promotion.ts",
  "apps/worker/src/run-adk-grounded-queue-enqueue.ts",
  "apps/worker/src/run-adk-live-pilot.ts",
  "apps/worker/src/run-adk-queue-enqueue.ts",
  "apps/worker/src/run-adk-queue-recover.ts",
  "apps/worker/src/run-adk-queue-worker.ts",
  "packages/contracts/src/ai-acquisition-evidence-v1.ts",
  "packages/contracts/src/ai-cognitive-migration-ledger-v1.ts",
  "packages/contracts/src/ai-assignment-candidate-promotion-v1.ts",
  "packages/contracts/src/ai-assignment-candidate-v1.ts",
  "packages/contracts/src/ai-assignment-graph-v1.ts",
  "packages/contracts/src/ai-assignment-library-v1.ts",
  "packages/contracts/src/ai-distilled-knowledge-v1.ts",
  "packages/contracts/src/ai-evidence-plane-owner-map-v1.ts",
  "packages/contracts/src/ai-grounded-execution-v1.ts",
  "packages/contracts/src/ai-grounded-prepared-evidence-v1.ts",
  "packages/contracts/src/ai-grounded-provider-authorization-v1.ts",
  "packages/contracts/src/ai-grounded-validation-v1.ts",
  "packages/contracts/src/ai-production-pilot-v1.ts",
  "packages/contracts/src/ai-source-pack-v1.ts",
  "packages/persistence/src/ai-assignment-candidate-promotion.ts",
  "packages/persistence/src/ai-assignment-candidate-registry.ts",
  "packages/persistence/src/ai-assignment-graph-registry.ts",
  "packages/persistence/src/ai-assignment-library-registry.ts",
  "packages/persistence/src/ai-distilled-knowledge-ingestion.ts",
  "packages/persistence/src/ai-grounded-prepared-execution-evidence.ts",
  "packages/persistence/src/ai-grounded-prepared-execution-ingestion.ts",
  "packages/persistence/src/ai-grounded-provider-authorization-registry.ts",
  "packages/persistence/src/ai-grounded-validation-evidence.ts",
  "packages/persistence/src/ai-knowledge-assignment-registry.ts",
  "packages/persistence/src/ai-source-pack-registry.ts",
  "packages/worker-runtime/src/ai-distilled-knowledge-acquirer.ts",
  "packages/worker-runtime/src/ai-grounded-execution-preparer.ts",
  "packages/worker-runtime/src/ai-grounded-output-validator.ts",
  "packages/worker-runtime/src/ai-production-pilot.ts",
  "packages/worker-runtime/src/ai-source-pack-renderer.ts",
  "packages/worker-runtime/src/managed-ai-capability-http-adapter.ts",
  "packages/worker-runtime/src/managed-ai-execution-http-client.ts",
  "packages/worker-runtime/src/managed-ai-knowledge-adapter.ts",
  "packages/worker-runtime/src/managed-ai-knowledge-http-adapter.ts",
  "packages/worker-runtime/src/openai-knowledge-adapter.ts",
] as const;

describe("AI Evidence Plane owner map", () => {
  it("classifies the frozen production AI/ADK inventory exactly once", () => {
    const mapped = AI_EVIDENCE_PLANE_OWNER_MAP_V1.map((entry) => entry.modulePath).sort();
    expect(new Set(mapped).size).toBe(mapped.length);
    expect(mapped).toEqual([...EXPECTED_PRODUCTION_AI_MODULES].sort());
  });

  it("keeps only evidence/provenance seams canonical in Knowledge", () => {
    expect(
      aiEvidencePlaneOwnerClassFor("packages/contracts/src/ai-acquisition-evidence-v1.ts"),
    ).toBe("KEEP-IN-KNOWLEDGE");
    expect(
      aiEvidencePlaneOwnerClassFor(
        "packages/contracts/src/ai-grounded-provider-authorization-v1.ts",
      ),
    ).toBe("KEEP-IN-KNOWLEDGE");
    expect(
      aiEvidencePlaneOwnerClassFor("packages/contracts/src/ai-distilled-knowledge-v1.ts"),
    ).toBe("DEPRECATE");
  });

  it("moves cognitive ownership and preserves mixed runtime only as adapters", () => {
    expect(aiEvidencePlaneOwnerClassFor("packages/contracts/src/ai-assignment-graph-v1.ts")).toBe(
      "MOVE-TO-BRAIN",
    );
    expect(
      aiEvidencePlaneOwnerClassFor("packages/persistence/src/ai-knowledge-assignment-registry.ts"),
    ).toBe("MOVE-TO-BRAIN");
    expect(
      aiEvidencePlaneOwnerClassFor(
        "packages/worker-runtime/src/ai-distilled-knowledge-acquirer.ts",
      ),
    ).toBe("ADAPTER");
  });
});
