import { createHash } from "node:crypto";
import type { VaultBindingV1, VaultImportIntentV1 } from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "@markorbit/persistence";
import {
  SqliteVaultBindingRepository,
  type VaultBindingRepository,
} from "@markorbit/persistence/vault-bindings";
import {
  SqliteVaultImportIntentRepository,
  type VaultImportIntentRecordResult,
  type VaultImportIntentRepository,
} from "@markorbit/persistence/vault-import-intents";
import {
  SqliteVaultInspectionRunRepository,
  type VaultInspectionRunRepository,
} from "@markorbit/persistence/vault-inspection-runs";
import { getRegistryDatabase } from "./source-registry";

export type ReviewVaultImportIntentInput = {
  inspectionRunId: string;
  vaultRelativePath: string;
  reviewNote?: string;
};

export type VaultImportIntentOverview = {
  binding: VaultBindingV1 | null;
  intents: VaultImportIntentV1[];
};

export type VaultImportIntentServiceDependencies = {
  bindings: VaultBindingRepository;
  inspections: VaultInspectionRunRepository;
  intents: VaultImportIntentRepository;
};

function required(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

function idempotencyKey(inspectionRunId: string, vaultRelativePath: string, hash: string): string {
  const digest = createHash("sha256")
    .update(`${inspectionRunId}\n${vaultRelativePath}\n${hash}`)
    .digest("hex");
  return `vault-import-intent:${digest}`;
}

function assertCurrentBindingMatches(
  current: VaultBindingV1 | null,
  frozen: { bindingId: string; revision: number; relativeRoot: string },
): void {
  if (!current) {
    throw new RegistryConflictError(
      "VAULT_IMPORT_INTENT_BINDING_MISSING",
      "Workspace Vault binding no longer exists; run a new inspection before approval",
    );
  }
  if (current.status !== "ACTIVE") {
    throw new RegistryConflictError(
      "VAULT_IMPORT_INTENT_BINDING_DISABLED",
      "Workspace Vault binding must remain ACTIVE before approving an import intent",
    );
  }
  if (
    current.id !== frozen.bindingId ||
    current.revision !== frozen.revision ||
    current.relativeRoot !== frozen.relativeRoot
  ) {
    throw new RegistryConflictError(
      "VAULT_IMPORT_INTENT_BINDING_CHANGED",
      "Vault binding changed after inspection; run a new inspection before approval",
    );
  }
}

export class VaultImportIntentService {
  constructor(private readonly dependencies: VaultImportIntentServiceDependencies) {}

  overview(workspaceIdValue: string): VaultImportIntentOverview {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    return {
      binding: this.dependencies.bindings.getByWorkspaceId(workspaceId),
      intents: this.dependencies.intents.list(workspaceId, 50),
    };
  }

  review(
    workspaceIdValue: string,
    inputValue: ReviewVaultImportIntentInput,
  ): VaultImportIntentRecordResult {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const inspectionRunId = required(inputValue.inspectionRunId, "inspectionRunId");
    const vaultRelativePath = required(inputValue.vaultRelativePath, "vaultRelativePath");
    const run = this.dependencies.inspections.getById(workspaceId, inspectionRunId);
    if (!run) {
      throw new RegistryValidationError(`Vault inspection run ${inspectionRunId} was not found`);
    }
    const candidate = run.candidates.find((item) => item.vaultRelativePath === vaultRelativePath);
    if (!candidate) {
      throw new RegistryValidationError(
        `Vault inspection candidate ${vaultRelativePath} was not found in ${inspectionRunId}`,
      );
    }
    if (candidate.classification !== "IMPORT_CANDIDATE") {
      throw new RegistryConflictError(
        "VAULT_IMPORT_INTENT_REQUIRES_IMPORT_CANDIDATE",
        `Only IMPORT_CANDIDATE evidence may be approved; ${candidate.classification} requires a different review path`,
      );
    }
    if (!candidate.observedSha256 || candidate.sizeBytes === undefined) {
      throw new RegistryConflictError(
        "VAULT_IMPORT_INTENT_INSPECTION_EVIDENCE_INCOMPLETE",
        "Import candidate is missing frozen hash or size evidence",
      );
    }

    const frozenInput = {
      workspaceId,
      idempotencyKey: idempotencyKey(run.id, candidate.vaultRelativePath, candidate.observedSha256),
      inspection: {
        inspectionRunId: run.id,
        rootFingerprintSha256: run.rootFingerprintSha256,
        observedAt: run.observedAt,
        binding: {
          bindingId: run.binding.bindingId,
          revision: run.binding.revision,
          relativeRoot: run.binding.relativeRoot,
        },
      },
      candidate: {
        vaultRelativePath: candidate.vaultRelativePath,
        bindingRelativePath: candidate.bindingRelativePath,
        observedSha256: candidate.observedSha256,
        sizeBytes: candidate.sizeBytes,
      },
      ...(inputValue.reviewNote !== undefined ? { reviewNote: inputValue.reviewNote } : {}),
    };

    const existing = this.dependencies.intents.getByCandidate(
      workspaceId,
      run.id,
      candidate.vaultRelativePath,
    );
    if (existing) {
      return this.dependencies.intents.record(frozenInput);
    }

    assertCurrentBindingMatches(
      this.dependencies.bindings.getByWorkspaceId(workspaceId),
      run.binding,
    );
    return this.dependencies.intents.record(frozenInput);
  }
}

export function getConfiguredVaultImportIntentService(): VaultImportIntentService {
  const database = getRegistryDatabase();
  return new VaultImportIntentService({
    bindings: new SqliteVaultBindingRepository(database),
    inspections: new SqliteVaultInspectionRunRepository(database),
    intents: new SqliteVaultImportIntentRepository(database),
  });
}
