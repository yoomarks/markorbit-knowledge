import { describe, expect, it } from "vitest";
import type { ReadyPackage } from "@markorbit/contracts";
import type { ReadyPackageRegistryRepository } from "@markorbit/persistence/ready-package-registry";
import { recordReadyPackageCoreIntakeAcknowledgment } from "../ready-package-core-intake-handoff";

const DIGEST = "a".repeat(64);

function verifiedPackage(): ReadyPackage {
  return {
    id: "rdp_test",
    workspaceId: "wsp_test",
    status: "VERIFIED",
    evidence: {
      artifactIds: ["art_test"],
      stagingDocumentId: "stg_test",
      digest: DIGEST,
      legalTruthVerified: false,
    },
    createdAt: "2026-08-10T00:00:00.000Z",
    verifiedAt: "2026-08-10T00:00:00.000Z",
  };
}

function repository(initial = verifiedPackage()) {
  let current = initial;
  let handoffCalls = 0;
  const repo: Pick<ReadyPackageRegistryRepository, "getById" | "markHandedOff"> = {
    getById(id, workspaceId) {
      return id === current.id && workspaceId === current.workspaceId ? current : null;
    },
    markHandedOff(id, workspaceId, expectedDigest) {
      handoffCalls += 1;
      if (id !== current.id || workspaceId !== current.workspaceId) throw new Error("not found");
      if (expectedDigest !== current.evidence.digest) throw new Error("digest mismatch");
      if (current.status === "HANDED_OFF") return current;
      current = {
        ...current,
        status: "HANDED_OFF",
        handedOffAt: "2026-08-10T00:01:00.000Z",
      };
      return current;
    },
  };
  return { repo, current: () => current, handoffCalls: () => handoffCalls };
}

function input(status: "RECEIVED" | "ACCEPTED" | "REJECTED") {
  return {
    workspaceId: "wsp_test",
    readyPackageId: "rdp_test",
    expectedDigest: DIGEST,
    acknowledge: true as const,
    coreIntakeResult: {
      intakeId: "intake_test",
      status,
      readyPackageId: "rdp_test",
    },
  };
}

describe("M32 ReadyPackage Core intake acknowledgment", () => {
  it.each(["RECEIVED", "ACCEPTED"] as const)(
    "records %s as an explicit handed-off package",
    (status) => {
      const state = repository();
      const result = recordReadyPackageCoreIntakeAcknowledgment(input(status), state.repo);

      expect(result).toMatchObject({
        handoffRecorded: true,
        replayed: false,
        disposition: "HANDOFF_RECORDED",
        readyPackage: { status: "HANDED_OFF" },
        coreIntakeResult: { status },
      });
      expect(state.handoffCalls()).toBe(1);
      expect(state.current().status).toBe("HANDED_OFF");
    },
  );

  it("keeps a rejected Core intake result VERIFIED so delivery can be retried", () => {
    const state = repository();
    const result = recordReadyPackageCoreIntakeAcknowledgment(input("REJECTED"), state.repo);

    expect(result).toMatchObject({
      handoffRecorded: false,
      replayed: false,
      disposition: "REJECTED_NOT_HANDED_OFF",
      readyPackage: { status: "VERIFIED" },
    });
    expect(state.handoffCalls()).toBe(0);
  });

  it("replays an already recorded successful handoff without creating a new state transition", () => {
    const handedOff: ReadyPackage = {
      ...verifiedPackage(),
      status: "HANDED_OFF",
      handedOffAt: "2026-08-10T00:01:00.000Z",
    };
    const state = repository(handedOff);
    const result = recordReadyPackageCoreIntakeAcknowledgment(input("RECEIVED"), state.repo);

    expect(result).toMatchObject({
      handoffRecorded: true,
      replayed: true,
      disposition: "HANDOFF_ALREADY_RECORDED",
      readyPackage: { status: "HANDED_OFF" },
    });
    expect(state.handoffCalls()).toBe(1);
  });

  it("fails closed when the acknowledged digest does not match the ReadyPackage", () => {
    const state = repository();
    expect(() =>
      recordReadyPackageCoreIntakeAcknowledgment(
        { ...input("RECEIVED"), expectedDigest: "b".repeat(64) },
        state.repo,
      ),
    ).toThrow("ReadyPackage digest mismatch");
    expect(state.handoffCalls()).toBe(0);
  });

  it("fails closed when the Core result belongs to another ReadyPackage", () => {
    const state = repository();
    expect(() =>
      recordReadyPackageCoreIntakeAcknowledgment(
        {
          ...input("RECEIVED"),
          coreIntakeResult: {
            intakeId: "intake_other",
            status: "RECEIVED",
            readyPackageId: "rdp_other",
          },
        },
        state.repo,
      ),
    ).toThrow("Core intake result belongs to another ReadyPackage");
    expect(state.handoffCalls()).toBe(0);
  });

  it("does not allow a later rejection to reverse an already recorded handoff", () => {
    const handedOff: ReadyPackage = {
      ...verifiedPackage(),
      status: "HANDED_OFF",
      handedOffAt: "2026-08-10T00:01:00.000Z",
    };
    const state = repository(handedOff);
    expect(() => recordReadyPackageCoreIntakeAcknowledgment(input("REJECTED"), state.repo)).toThrow(
      "A rejected Core intake result cannot reverse an already recorded handoff",
    );
  });
});
