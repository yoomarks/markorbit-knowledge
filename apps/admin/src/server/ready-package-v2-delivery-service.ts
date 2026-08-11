import { resolve } from "node:path";
import type { ReadyPackageV2 } from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
} from "@markorbit/persistence";
import {
  SqliteCanonicalDownstreamDocumentRepository,
  type CanonicalDownstreamDocumentRepository,
} from "@markorbit/persistence/canonical-downstream-documents";
import {
  SqliteCoreWorkspaceBindingRepository,
  type CoreWorkspaceBindingRepository,
} from "@markorbit/persistence/core-workspace-bindings";
import {
  diagnoseReadyPackageV2Delivery,
  type ReadyPackageV2DeliveryDiagnosis,
  type ReadyPackageV2DeliveryDiagnosisState,
} from "@markorbit/persistence/ready-package-v2-delivery-reconciliation";
import {
  SqliteReadyPackageV2DeliverySubmissionRepository,
  type ReadyPackageV2DeliveryAuditEvent,
  type ReadyPackageV2DeliverySubmission,
  type ReadyPackageV2DeliverySubmissionRepository,
} from "@markorbit/persistence/ready-package-v2-deliveries";
import {
  SqliteReadyPackageV2RegistryRepository,
  type ReadyPackageV2RegistryRepository,
} from "@markorbit/persistence/ready-packages-v2";
import {
  SqliteVaultOriginStagingRepository,
  type VaultOriginStagingRepository,
} from "@markorbit/persistence/vault-import-executions";
import { buildReadyPackageContentExportV2 } from "./ready-package-content-export-v2";
import {
  ReadyPackageV2DeliveryTransportError,
  configuredReadyPackageV2DeliveryTransport,
  readyPackageV2DeliveryTransportReadiness,
  type ReadyPackageV2DeliveryTransport,
  type ReadyPackageV2DeliveryTransportReadiness,
} from "./ready-package-v2-delivery-http-transport";
import { getRegistryDatabase } from "./source-registry";

export type ReadyPackageV2DeliveryStage = "NOT_PREPARED" | ReadyPackageV2DeliveryDiagnosisState;

export type ReadyPackageV2DeliverySubmissionView = Omit<
  ReadyPackageV2DeliverySubmission,
  "requestJson" | "idempotencyKey"
>;

export type ReadyPackageV2DeliveryOverviewItem = {
  readyPackage: ReadyPackageV2;
  stage: ReadyPackageV2DeliveryStage;
  diagnosis: ReadyPackageV2DeliveryDiagnosis | null;
  submission: ReadyPackageV2DeliverySubmissionView | null;
  auditEvents: ReadyPackageV2DeliveryAuditEvent[];
  outboundTransport: ReadyPackageV2DeliveryTransportReadiness;
};

export type ReadyPackageV2DeliveryOverview = {
  currentCoreWorkspaceId: string | null;
  items: ReadyPackageV2DeliveryOverviewItem[];
};

export type ReadyPackageV2DeliveryServiceDependencies = {
  readyPackages: ReadyPackageV2RegistryRepository;
  canonical: CanonicalDownstreamDocumentRepository;
  staging: Pick<VaultOriginStagingRepository, "readContent">;
  bindings: CoreWorkspaceBindingRepository;
  deliveries: ReadyPackageV2DeliverySubmissionRepository;
  transport: ReadyPackageV2DeliveryTransport;
};

export type ReadyPackageV2DeliveryActionResult = {
  submission: ReadyPackageV2DeliverySubmission;
  replayed: boolean;
  transportUsed: boolean;
};

function required(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

export function readyPackageV2DeliverySubmissionView(
  submission: ReadyPackageV2DeliverySubmission,
): ReadyPackageV2DeliverySubmissionView {
  return {
    submissionId: submission.submissionId,
    workspaceId: submission.workspaceId,
    readyPackageId: submission.readyPackageId,
    readyPackageDigest: submission.readyPackageDigest,
    coreWorkspaceId: submission.coreWorkspaceId,
    requestSha256: submission.requestSha256,
    contentExportSha256: submission.contentExportSha256,
    state: submission.state,
    transportAttempts: submission.transportAttempts,
    ...(submission.lastTransportAttemptedAt
      ? { lastTransportAttemptedAt: submission.lastTransportAttemptedAt }
      : {}),
    ...(submission.transportResult ? { transportResult: submission.transportResult } : {}),
    ...(submission.result ? { result: submission.result } : {}),
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
  };
}

function stagingStorePath(): string {
  const configured = process.env.MARKORBIT_STAGING_STORE_PATH?.trim();
  if (configured) return resolve(configured);
  const repositoryRoot =
    process.env.MARKORBIT_REPOSITORY_ROOT ?? process.env.INIT_CWD ?? process.cwd();
  return resolve(repositoryRoot, ".data", "staging");
}

function transportUncertainty(error: unknown): { issueCode: string; httpStatus: number } {
  if (error instanceof ReadyPackageV2DeliveryTransportError) {
    return { issueCode: error.code, httpStatus: error.httpStatus };
  }
  return { issueCode: "CORE_V2_DELIVERY_TRANSPORT_EXCEPTION", httpStatus: 502 };
}

function evidenceInconsistent(diagnosis: ReadyPackageV2DeliveryDiagnosis): RegistryConflictError {
  const issueCodes = diagnosis.issues.map((value) => value.code).join(", ") || "UNKNOWN";
  return new RegistryConflictError(
    "READY_PACKAGE_V2_DELIVERY_EVIDENCE_INCONSISTENT",
    `ReadyPackage V2 delivery evidence is inconsistent (${issueCodes}); outbound automation is blocked`,
  );
}

export class ReadyPackageV2DeliveryService {
  constructor(private readonly dependencies: ReadyPackageV2DeliveryServiceDependencies) {}

  private diagnose(
    workspaceId: string,
    submission: ReadyPackageV2DeliverySubmission,
  ): {
    diagnosis: ReadyPackageV2DeliveryDiagnosis;
    auditEvents: ReadyPackageV2DeliveryAuditEvent[];
  } {
    const auditEvents = this.dependencies.deliveries.listAuditEvents(
      workspaceId,
      submission.submissionId,
      200,
    );
    return {
      diagnosis: diagnoseReadyPackageV2Delivery(submission, auditEvents),
      auditEvents,
    };
  }

  overview(workspaceIdValue: string): ReadyPackageV2DeliveryOverview {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const binding = this.dependencies.bindings.getByKnowledgeWorkspaceId(workspaceId);
    const submissions = new Map(
      this.dependencies.deliveries
        .list(workspaceId, 100)
        .map((submission) => [submission.readyPackageId, submission]),
    );
    const items = this.dependencies.readyPackages.list(workspaceId, 100).map((readyPackage) => {
      const submission = submissions.get(readyPackage.id) ?? null;
      const targetWorkspaceId = submission?.coreWorkspaceId ?? binding?.coreWorkspaceId ?? null;
      if (!submission) {
        return {
          readyPackage,
          stage: "NOT_PREPARED" as const,
          diagnosis: null,
          submission: null,
          auditEvents: [],
          outboundTransport: readyPackageV2DeliveryTransportReadiness(targetWorkspaceId),
        } satisfies ReadyPackageV2DeliveryOverviewItem;
      }
      const reconciled = this.diagnose(workspaceId, submission);
      return {
        readyPackage,
        stage: reconciled.diagnosis.state,
        diagnosis: reconciled.diagnosis,
        submission: readyPackageV2DeliverySubmissionView(submission),
        auditEvents: reconciled.auditEvents.slice(-50),
        outboundTransport: readyPackageV2DeliveryTransportReadiness(targetWorkspaceId),
      } satisfies ReadyPackageV2DeliveryOverviewItem;
    });
    return { currentCoreWorkspaceId: binding?.coreWorkspaceId ?? null, items };
  }

  prepare(
    workspaceIdValue: string,
    readyPackageIdValue: string,
  ): ReadyPackageV2DeliveryActionResult {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const readyPackageId = required(readyPackageIdValue, "readyPackageId");
    const existing = this.dependencies.deliveries.getByReadyPackage(workspaceId, readyPackageId);
    if (existing) {
      const { diagnosis } = this.diagnose(workspaceId, existing);
      if (diagnosis.state === "EVIDENCE_INCONSISTENT") throw evidenceInconsistent(diagnosis);
      return { submission: existing, replayed: true, transportUsed: false };
    }

    const readyPackage = this.dependencies.readyPackages.getById(workspaceId, readyPackageId);
    if (!readyPackage) {
      throw new RegistryError(
        "READY_PACKAGE_V2_NOT_FOUND",
        `ReadyPackage V2 ${readyPackageId} was not found`,
      );
    }
    const binding = this.dependencies.bindings.getByKnowledgeWorkspaceId(workspaceId);
    if (!binding) {
      throw new RegistryConflictError(
        "CORE_WORKSPACE_NOT_BOUND",
        "ReadyPackage V2 delivery preparation requires a canonical Core Workspace binding",
      );
    }
    const contentExport = buildReadyPackageContentExportV2(
      { workspaceId, readyPackageId },
      this.dependencies,
    );
    const prepared = this.dependencies.deliveries.prepare({
      workspaceId,
      readyPackage,
      coreWorkspaceId: binding.coreWorkspaceId,
      contentExport,
    });
    return { submission: prepared.submission, replayed: prepared.replayed, transportUsed: false };
  }

  async submit(
    workspaceIdValue: string,
    readyPackageIdValue: string,
  ): Promise<ReadyPackageV2DeliveryActionResult> {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const readyPackageId = required(readyPackageIdValue, "readyPackageId");
    let submission = this.dependencies.deliveries.getByReadyPackage(workspaceId, readyPackageId);
    if (!submission) {
      throw new RegistryConflictError(
        "READY_PACKAGE_V2_DELIVERY_NOT_PREPARED",
        "Freeze the ReadyPackage V2 delivery request before submitting it",
      );
    }

    const { diagnosis } = this.diagnose(workspaceId, submission);
    if (diagnosis.state === "EVIDENCE_INCONSISTENT") throw evidenceInconsistent(diagnosis);
    if (diagnosis.state === "DELIVERED") {
      return { submission, replayed: true, transportUsed: false };
    }
    if (diagnosis.state === "CONSUMER_REJECTED") {
      throw new RegistryConflictError(
        "READY_PACKAGE_V2_DELIVERY_CONSUMER_REJECTED",
        "ReadyPackage V2 delivery was rejected by the consumer and requires operator review",
      );
    }
    if (diagnosis.state === "LOCAL_FINALIZATION_REQUIRED") {
      if (!submission.transportResult) throw evidenceInconsistent(diagnosis);
      submission = this.dependencies.deliveries.recordResult(
        workspaceId,
        submission.submissionId,
        submission.transportResult,
      );
      return { submission, replayed: true, transportUsed: false };
    }

    const readiness = readyPackageV2DeliveryTransportReadiness(submission.coreWorkspaceId);
    if (!readiness.configured) {
      throw new RegistryConflictError(
        readiness.issueCode ?? "CORE_V2_DELIVERY_NOT_CONFIGURED",
        "ReadyPackage V2 outbound transport is not explicitly configured for protocol V1",
      );
    }

    submission = this.dependencies.deliveries.markTransportAttempt(
      workspaceId,
      submission.submissionId,
    );
    let transportResult;
    try {
      transportResult = await this.dependencies.transport.submit(
        submission.requestJson,
        submission.idempotencyKey,
      );
    } catch (error) {
      this.dependencies.deliveries.recordTransportUncertainty(
        workspaceId,
        submission.submissionId,
        transportUncertainty(error),
      );
      throw error;
    }
    submission = this.dependencies.deliveries.recordTransportResult(
      workspaceId,
      submission.submissionId,
      transportResult,
    );
    submission = this.dependencies.deliveries.recordResult(
      workspaceId,
      submission.submissionId,
      transportResult,
    );
    return { submission, replayed: false, transportUsed: true };
  }
}

export function getConfiguredReadyPackageV2DeliveryService(): ReadyPackageV2DeliveryService {
  const database = getRegistryDatabase();
  const canonical = new SqliteCanonicalDownstreamDocumentRepository(database);
  const readyPackages = new SqliteReadyPackageV2RegistryRepository(database, canonical);
  const staging = new SqliteVaultOriginStagingRepository(database, stagingStorePath());
  return new ReadyPackageV2DeliveryService({
    readyPackages,
    canonical,
    staging,
    bindings: new SqliteCoreWorkspaceBindingRepository(database),
    deliveries: new SqliteReadyPackageV2DeliverySubmissionRepository(database),
    transport: configuredReadyPackageV2DeliveryTransport(),
  });
}
