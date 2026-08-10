import { describe, expect, it } from "vitest";
import type { ReadyPackage } from "@markorbit/contracts";
import {
  recordReadyPackageCoreIntakeAcknowledgment,
  type CoreIntakeHandoffRepository,
  type ReadyPackageCoreIntakeAcknowledgmentInput,
} from "../ready-package-core-intake-handoff";

const DIGEST = "a".repeat(64);

function handedOffPackage(): ReadyPackage {
  return {
    id: "rdp_test",
    workspaceId: "wsp_test",
    status: "HANDED_OFF",
    evidence: {
      artifactIds: ["art_test"],
      stagingDocumentId: "stg_test",
      digest: DIGEST,
      legalTruthVerified: false,
    },
    createdAt: "2026-08-10T00:00:00.000Z",
    verifiedAt: "2026-08-10T00:00:00.000Z",
    handedOffAt: "2026-08-10T00:01:00.000Z",
  };
}

function input(): ReadyPackageCoreIntakeAcknowledgmentInput {
  return {
    workspaceId: "wsp_test",
    readyPackageId: "rdp_test",
    expectedDigest: DIGEST,
    acknowledge: true,
    coreIntakeResult: {
      intakeId: "intake_test",
      status: "RECEIVED",
      readyPackageId: "rdp_test",
    },
  };
}

describe("M33 ReadyPackage Core intake acknowledgment boundary", () => {
  it("delegates explicit acknowledgment evidence to the atomic ReadyPackage repository operation", () => {
    let persistedInput:
      Parameters<CoreIntakeHandoffRepository["recordCoreIntakeAcknowledgment"]>[0] | null = null;
    const repo: CoreIntakeHandoffRepository = {
      recordCoreIntakeAcknowledgment(persistenceInput) {
        persistedInput = persistenceInput;
        return {
          readyPackage: handedOffPackage(),
          receipt: {
            intakeId: persistenceInput.coreIntakeResult.intakeId,
            workspaceId: persistenceInput.workspaceId,
            readyPackageId: persistenceInput.readyPackageId,
            expectedDigest: persistenceInput.expectedDigest,
            status: persistenceInput.coreIntakeResult.status,
            recordedAt: "2026-08-10T00:01:00.000Z",
          },
          coreIntakeResult: persistenceInput.coreIntakeResult,
          handoffRecorded: true,
          replayed: false,
          disposition: "HANDOFF_RECORDED",
        };
      },
    };

    const result = recordReadyPackageCoreIntakeAcknowledgment(input(), repo);

    expect(persistedInput).toEqual({
      workspaceId: "wsp_test",
      readyPackageId: "rdp_test",
      expectedDigest: DIGEST,
      coreIntakeResult: {
        intakeId: "intake_test",
        status: "RECEIVED",
        readyPackageId: "rdp_test",
      },
    });
    expect(result).toMatchObject({
      disposition: "HANDOFF_RECORDED",
      receipt: { intakeId: "intake_test", status: "RECEIVED" },
      readyPackage: { status: "HANDED_OFF" },
    });
  });

  it("still requires an explicit acknowledge=true boundary before touching persistence", () => {
    let calls = 0;
    const repo: CoreIntakeHandoffRepository = {
      recordCoreIntakeAcknowledgment() {
        calls += 1;
        throw new Error("should not persist");
      },
    };
    const invalid = {
      ...input(),
      acknowledge: false,
    } as unknown as ReadyPackageCoreIntakeAcknowledgmentInput;

    expect(() => recordReadyPackageCoreIntakeAcknowledgment(invalid, repo)).toThrow(
      "acknowledge=true is required",
    );
    expect(calls).toBe(0);
  });
});
