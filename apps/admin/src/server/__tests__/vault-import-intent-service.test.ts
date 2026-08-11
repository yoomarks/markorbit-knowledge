import { describe, expect, it } from "vitest";
import type {
  VaultBindingV1,
  VaultImportIntentV1,
  VaultInspectionRunV1,
} from "@markorbit/contracts";
import type { VaultBindingRepository } from "@markorbit/persistence/vault-bindings";
import type {
  RecordVaultImportIntentInput,
  VaultImportIntentRecordResult,
  VaultImportIntentRepository,
} from "@markorbit/persistence/vault-import-intents";
import type { VaultInspectionRunRepository } from "@markorbit/persistence/vault-inspection-runs";
import { VaultImportIntentService } from "../vault-import-intent-service";

const WORKSPACE = "wsp_01K09TEST000000000000000001";

function binding(overrides: Partial<VaultBindingV1> = {}): VaultBindingV1 {
  return {
    contractVersion: "1.0",
    objectType: "VAULT_BINDING",
    id: "vlt_01K09TEST000000000000000001",
    workspaceId: WORKSPACE,
    name: "Review Vault",
    adapter: "LOCAL_FILESYSTEM",
    relativeRoot: "MarkOrbit/Review",
    status: "ACTIVE",
    revision: 4,
    createdAt: "2026-08-11T13:00:00.000Z",
    updatedAt: "2026-08-11T13:00:00.000Z",
    ...overrides,
  };
}

function inspection(
  classification: "IMPORT_CANDIDATE" | "CONFLICT" | "UNCHANGED" | "MISSING" = "IMPORT_CANDIDATE",
): VaultInspectionRunV1 {
  const present = classification !== "MISSING";
  const tracked = classification !== "IMPORT_CANDIDATE";
  return {
    contractVersion: "1.0",
    objectType: "VAULT_INSPECTION_RUN",
    id: "vin_01K09TEST000000000000000001",
    workspaceId: WORKSPACE,
    rootFingerprintSha256: "a".repeat(64),
    binding: {
      bindingId: binding().id,
      revision: binding().revision,
      relativeRoot: binding().relativeRoot,
    },
    candidates: [
      {
        vaultRelativePath: "MarkOrbit/Review/incoming/new.md",
        bindingRelativePath: "incoming/new.md",
        classification,
        ...(present ? { observedSha256: "b".repeat(64), sizeBytes: 17 } : {}),
        ...(tracked
          ? {
              managedExport: {
                exportRunId: "vex_01K09TEST000000000000000001",
                stagingDocumentId: "stg_01K09TEST000000000000000001",
                contentSha256: classification === "UNCHANGED" ? "b".repeat(64) : "c".repeat(64),
              },
            }
          : {}),
        frontmatter: { status: "NONE", keys: [], fields: {} },
        wikiLinks: [],
      },
    ],
    observedAt: "2026-08-11T13:10:00.000Z",
  };
}

function bindingRepository(current: VaultBindingV1 | null): VaultBindingRepository {
  return {
    getByWorkspaceId: () => current,
    configure: () => {
      throw new Error("not used");
    },
    setStatus: () => {
      throw new Error("not used");
    },
  };
}

function inspectionRepository(run: VaultInspectionRunV1): VaultInspectionRunRepository {
  return {
    record: () => {
      throw new Error("not used");
    },
    getById: (_workspaceId, runId) => (runId === run.id ? run : null),
    list: () => [run],
  };
}

class MemoryIntentRepository implements VaultImportIntentRepository {
  readonly records: VaultImportIntentV1[] = [];
  calls = 0;

  record(input: RecordVaultImportIntentInput): VaultImportIntentRecordResult {
    this.calls += 1;
    const existing = this.getByCandidate(
      input.workspaceId,
      input.inspection.inspectionRunId,
      input.candidate.vaultRelativePath,
    );
    if (existing) {
      if ((existing.reviewNote ?? undefined) !== (input.reviewNote?.trim() || undefined)) {
        throw new Error("different reviewed import intent");
      }
      return { intent: existing, replayed: true };
    }
    const intent: VaultImportIntentV1 = {
      contractVersion: "1.0",
      objectType: "VAULT_IMPORT_INTENT",
      id: "vmi_01K09TEST000000000000000001",
      workspaceId: input.workspaceId,
      idempotencyKey: input.idempotencyKey,
      inspection: input.inspection,
      candidate: input.candidate,
      action: "IMPORT_TO_STAGING",
      state: "PENDING_EXECUTION",
      ...(input.reviewNote?.trim() ? { reviewNote: input.reviewNote.trim() } : {}),
      reviewedAt: "2026-08-11T13:20:00.000Z",
    };
    this.records.push(intent);
    return { intent, replayed: false };
  }

  getById(workspaceId: string, intentId: string): VaultImportIntentV1 | null {
    return (
      this.records.find((item) => item.workspaceId === workspaceId && item.id === intentId) ?? null
    );
  }

  getByCandidate(
    workspaceId: string,
    inspectionRunId: string,
    vaultRelativePath: string,
  ): VaultImportIntentV1 | null {
    return (
      this.records.find(
        (item) =>
          item.workspaceId === workspaceId &&
          item.inspection.inspectionRunId === inspectionRunId &&
          item.candidate.vaultRelativePath === vaultRelativePath,
      ) ?? null
    );
  }

  list(workspaceId: string, limit = 20): VaultImportIntentV1[] {
    return this.records.filter((item) => item.workspaceId === workspaceId).slice(0, limit);
  }
}

function service(options: { run?: VaultInspectionRunV1; binding?: VaultBindingV1 | null } = {}) {
  const run = options.run ?? inspection();
  const intents = new MemoryIntentRepository();
  return {
    intents,
    service: new VaultImportIntentService({
      bindings: bindingRepository(options.binding === undefined ? binding() : options.binding),
      inspections: inspectionRepository(run),
      intents,
    }),
  };
}

describe("Vault import intent service", () => {
  it("approves only frozen IMPORT_CANDIDATE evidence without any filesystem or Staging dependency", () => {
    const { intents, service: subject } = service();
    const result = subject.review(WORKSPACE, {
      inspectionRunId: inspection().id,
      vaultRelativePath: "MarkOrbit/Review/incoming/new.md",
      reviewNote: "Operator reviewed the note",
    });

    expect(result.replayed).toBe(false);
    expect(result.intent.candidate.observedSha256).toBe("b".repeat(64));
    expect(result.intent.inspection.binding).toEqual(inspection().binding);
    expect(result.intent.state).toBe("PENDING_EXECUTION");
    expect(intents.records).toHaveLength(1);
  });

  it("fails closed when the current binding changed, was disabled, or disappeared", () => {
    for (const current of [binding({ revision: 5 }), binding({ status: "DISABLED" }), null]) {
      const { service: subject } = service({ binding: current });
      expect(() =>
        subject.review(WORKSPACE, {
          inspectionRunId: inspection().id,
          vaultRelativePath: "MarkOrbit/Review/incoming/new.md",
        }),
      ).toThrowError(/binding/u);
    }
  });

  it("refuses CONFLICT, UNCHANGED and MISSING observations", () => {
    for (const classification of ["CONFLICT", "UNCHANGED", "MISSING"] as const) {
      const run = inspection(classification);
      const { service: subject } = service({ run });
      expect(() =>
        subject.review(WORKSPACE, {
          inspectionRunId: run.id,
          vaultRelativePath: "MarkOrbit/Review/incoming/new.md",
        }),
      ).toThrowError(/Only IMPORT_CANDIDATE/u);
    }
  });

  it("replays an already durable exact approval even if the binding later changes", () => {
    const intents = new MemoryIntentRepository();
    const run = inspection();
    const first = new VaultImportIntentService({
      bindings: bindingRepository(binding()),
      inspections: inspectionRepository(run),
      intents,
    });
    const request = {
      inspectionRunId: run.id,
      vaultRelativePath: "MarkOrbit/Review/incoming/new.md",
      reviewNote: "Approved once",
    };
    expect(first.review(WORKSPACE, request).replayed).toBe(false);

    const retry = new VaultImportIntentService({
      bindings: bindingRepository(binding({ revision: 99 })),
      inspections: inspectionRepository(run),
      intents,
    });
    expect(retry.review(WORKSPACE, request).replayed).toBe(true);
    expect(intents.records).toHaveLength(1);
  });

  it("does not allow review evidence to be silently changed on replay", () => {
    const { service: subject } = service();
    const request = {
      inspectionRunId: inspection().id,
      vaultRelativePath: "MarkOrbit/Review/incoming/new.md",
    };
    subject.review(WORKSPACE, { ...request, reviewNote: "First review" });
    expect(() =>
      subject.review(WORKSPACE, { ...request, reviewNote: "Changed review" }),
    ).toThrowError(/different reviewed import intent/u);
  });
});
