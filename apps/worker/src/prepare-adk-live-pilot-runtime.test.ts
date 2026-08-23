import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { SqliteRawArtifactRepository } from "@markorbit/persistence/raw-artifacts";
import type { AiProductionPilotPlanV1 } from "@markorbit/worker-runtime/ai-production-pilot";
import {
  prepareAdkLivePilotRuntime,
  type AdkLivePilotPreparationConfig,
} from "./prepare-adk-live-pilot-runtime";
import { loadAdkLivePilotRuntimeSecret } from "./adk-live-pilot-runtime-secret";
import { loadAdkLivePilotConfig } from "./run-adk-live-pilot";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function plan(overrides: Partial<AiProductionPilotPlanV1> = {}): AiProductionPilotPlanV1 {
  return {
    protocolVersion: "1.0",
    objectType: "AI_PRODUCTION_PILOT_PLAN",
    pilotId: "app_us_trademark_live_acceptance",
    assignmentIds: [
      "kas_us_trademark_filing",
      "kas_us_trademark_section_8",
      "kas_us_trademark_ttab",
    ],
    providers: ["DEEPSEEK", "OPENAI"],
    approvalRef: "approval/adk-06/live-3x2",
    liveProviderCallsAuthorized: true,
    boundaries: {
      compareProviderQuality: false,
      legalTruthVerified: false,
      candidateAutoActivation: false,
    },
    createdAt: "2026-08-24T00:00:00.000Z",
    ...overrides,
  };
}

function fixture(pilotPlan: AiProductionPilotPlanV1 = plan()): AdkLivePilotPreparationConfig {
  const root = join(tmpdir(), `markorbit-adk-live-${randomUUID()}`);
  temporaryRoots.push(root);
  mkdirSync(root, { recursive: true });
  const planPath = join(root, "pilot-plan.json");
  writeFileSync(planPath, `${JSON.stringify(pilotPlan, null, 2)}\n`, "utf8");
  return {
    databasePath: join(root, "live.sqlite"),
    storageRoot: join(root, "artifacts"),
    planPath,
    runtimeSecretPath: join(root, "runtime-secret.json"),
    preparationReceiptPath: join(root, "preparation-receipt.json"),
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

describe("ADK live pilot runtime preparation", () => {
  it("prepares a fresh upload-ready runtime without making provider calls or leaking credentials", () => {
    const config = fixture();
    const receipt = prepareAdkLivePilotRuntime(config);
    const secret = loadAdkLivePilotRuntimeSecret(config.runtimeSecretPath);

    expect(receipt.assignmentIds).toEqual(plan().assignmentIds);
    expect(receipt.providers).toEqual(["DEEPSEEK", "OPENAI"]);
    expect(receipt.executionStatus).toBe("UPLOADING");
    expect(receipt.boundaries).toEqual({
      providerCallsExecuted: false,
      providerSecretsStored: false,
      providerRankingProduced: false,
      legalTruthVerified: false,
      candidateAutoActivationApplied: false,
    });
    expect(secret.pilotId).toBe(receipt.pilotId);
    expect(secret.approvalRef).toBe(receipt.approvalRef);
    expect(secret.workerId).toBe(receipt.workerId);
    expect(secret.leaseId).toBe(receipt.leaseId);
    expect(secret.databasePath).toBe(config.databasePath);
    expect(secret.storageRoot).toBe(config.storageRoot);
    expect(secret.planPath).toBe(config.planPath);

    const serializedReceipt = JSON.stringify(receipt);
    expect(serializedReceipt).not.toContain(secret.workerCredential);
    expect(serializedReceipt).not.toContain(secret.leaseToken);
    expect(readFileSync(config.preparationReceiptPath, "utf8")).not.toContain(
      secret.workerCredential,
    );
    expect(statSync(config.runtimeSecretPath).mode & 0o777).toBe(0o600);

    const database = new DatabaseSync(config.databasePath);
    const artifacts = new SqliteRawArtifactRepository(database, config.storageRoot);
    expect(() =>
      artifacts.createSession({
        workerId: secret.workerId,
        credential: secret.workerCredential,
        leaseId: secret.leaseId,
        leaseToken: secret.leaseToken,
        idempotencyKey: "adk-live-preparation-auth-check",
        descriptor: {
          artifactKind: "JSON",
          mimeType: "application/json",
          originalName: "auth-check.json",
          expectedSizeBytes: 2,
          expectedSha256: sha256("{}"),
          sourceUri: "ai-provider://preparation/auth-check",
        },
      }),
    ).not.toThrow();
    database.close();
  });

  it("allows the live runner to consume the prepared runtime secret as one bound input", () => {
    const config = fixture();
    const receipt = prepareAdkLivePilotRuntime(config);
    const loaded = loadAdkLivePilotConfig({
      MARKORBIT_ADK_LIVE_RUNTIME_SECRET_PATH: config.runtimeSecretPath,
      MARKORBIT_ADK_LIVE_RECEIPT_PATH: join(config.storageRoot, "acceptance.json"),
    });

    expect(loaded.databasePath).toBe(config.databasePath);
    expect(loaded.storageRoot).toBe(config.storageRoot);
    expect(loaded.planPath).toBe(config.planPath);
    expect(loaded.workerId).toBe(receipt.workerId);
    expect(loaded.leaseId).toBe(receipt.leaseId);
    expect(loaded.runtimeBinding).toEqual({
      pilotId: receipt.pilotId,
      approvalRef: receipt.approvalRef,
      runtimeSecretPath: config.runtimeSecretPath,
    });
  });

  it("fails before creating runtime state when the provider set is not the frozen 3x2 pair", () => {
    const config = fixture(plan({ providers: ["OPENAI", "DEEPSEEK"] }));

    expect(() => prepareAdkLivePilotRuntime(config)).toThrowError(
      /exactly DEEPSEEK,OPENAI/u,
    );
    expect(existsSync(config.databasePath)).toBe(false);
    expect(existsSync(config.storageRoot)).toBe(false);
    expect(existsSync(config.runtimeSecretPath)).toBe(false);
  });

  it("fails before creating runtime state when a frozen assignment is outside the US library", () => {
    const config = fixture(
      plan({
        assignmentIds: [
          "kas_us_trademark_filing",
          "kas_us_trademark_section_8",
          "kas_us_trademark_not_in_library",
        ],
      }),
    );

    expect(() => prepareAdkLivePilotRuntime(config)).toThrowError(/not in kal_us_trademark_core/u);
    expect(existsSync(config.databasePath)).toBe(false);
    expect(existsSync(config.storageRoot)).toBe(false);
  });

  it("refuses to overwrite any previously prepared target", () => {
    const config = fixture();
    writeFileSync(config.runtimeSecretPath, "reserved", "utf8");

    expect(() => prepareAdkLivePilotRuntime(config)).toThrowError(/runtime secret target already exists/u);
    expect(existsSync(config.databasePath)).toBe(false);
    expect(existsSync(config.storageRoot)).toBe(false);
  });
});
