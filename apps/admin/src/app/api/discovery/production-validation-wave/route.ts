import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { queueProductionValidationWaveForDiscovery } from "@markorbit/persistence/production-validation-discovery-intake";
import { inspectProductionValidationExecution } from "@markorbit/persistence/production-validation-execution-status";
import { inspectProductionValidationOnboarding } from "@markorbit/persistence/production-validation-onboarding-status";
import { inspectProductionValidationPipeline } from "@markorbit/persistence/production-validation-pipeline-status";
import {
  buildProductionValidationScorecard,
  type ProductionValidationStructuredRemediationTelemetry,
} from "@markorbit/persistence/production-validation-scorecard";
import { SqliteProductionValidationScorecardSnapshotRepository } from "@markorbit/persistence/production-validation-scorecard-snapshots";
import { SqliteSourceCompatibilityObservationRepository } from "@markorbit/persistence/source-compatibility-observations";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { buildFoundationalRemediationQueueSnapshot } from "@/server/foundational-remediation-queue";
import {
  resolveOperatorServiceMutationAccess,
  resolveOperatorServiceReadAccess,
} from "@/server/operator-service-api-access";
import {
  loadProductionValidationWave,
  resolveProductionValidationWorkspaceId,
} from "@/server/production-validation-wave";
import {
  getConversionRunLedgerRepository,
  getExecutionLedgerRepository,
  getRawArtifactRepository,
  getRegistryDatabase,
  getSourceDiscoveryRepository,
  getSourceRepository,
  getStagingContentRepository,
  withRegistryTransaction,
} from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCORECARD_CAPTURE_ACTION = "CAPTURE_SCORECARD";

type CoverageLinkedTarget = {
  id: string;
  jurisdiction: string;
  coverageTargetIds: string[];
};

type StructuredRemediationItem = Omit<
  ProductionValidationStructuredRemediationTelemetry,
  "state"
> & {
  state: Exclude<ProductionValidationStructuredRemediationTelemetry["state"], "UNOBSERVED">;
};

function aggregateStructuredRemediation(
  items: StructuredRemediationItem[],
): ProductionValidationStructuredRemediationTelemetry | null {
  if (items.length === 0) return null;
  const state = items.some((item) => item.state === "INVALID")
    ? "INVALID"
    : items.some((item) => item.state === "UNPREPARED")
      ? "UNPREPARED"
      : "PREPARED_AWAITING_WORKER_BINDING";
  const requiredArtifactKinds = [
    ...new Set(items.flatMap((item) => item.requiredArtifactKinds)),
  ].sort();
  const only = items.length === 1 ? items[0] : null;
  return {
    state,
    requiredArtifactKinds,
    sourceId: only?.sourceId ?? null,
    planId: only?.planId ?? null,
    endpointBinding: only?.endpointBinding ?? null,
    workerEndpointBindingState: "EXTERNAL_UNVERIFIED",
    collectionAuthorization: "NONE",
    automaticExecution: false,
  };
}

function structuredRemediationFacts(
  workspaceId: string,
  targets: ReadonlyArray<CoverageLinkedTarget>,
): Map<string, ProductionValidationStructuredRemediationTelemetry> {
  const database = getRegistryDatabase();
  const result = new Map<string, ProductionValidationStructuredRemediationTelemetry>();
  for (const target of targets) {
    const items: StructuredRemediationItem[] = [];
    for (const coverageTargetId of target.coverageTargetIds) {
      const snapshot = buildFoundationalRemediationQueueSnapshot(database, {
        workspaceId,
        jurisdiction: target.jurisdiction,
        targetId: coverageTargetId,
      });
      const item = snapshot.apiRemediation.items[0];
      if (!item) continue;
      items.push({
        state: item.state,
        requiredArtifactKinds: [...item.requiredArtifactKinds],
        sourceId: item.sourceId,
        planId: item.planId,
        endpointBinding: item.endpointBinding,
        workerEndpointBindingState: item.workerEndpointBindingState,
        collectionAuthorization: item.collectionAuthorization,
        automaticExecution: item.automaticExecution,
      });
    }
    const aggregate = aggregateStructuredRemediation(items);
    if (aggregate) result.set(target.id, aggregate);
  }
  return result;
}

function inspectCurrentWave(workspaceId: string) {
  const manifest = loadProductionValidationWave();
  const sources = getSourceRepository();
  const onboarding = inspectProductionValidationOnboarding(
    { workspaceId, manifest },
    { sources, discovery: getSourceDiscoveryRepository() },
  );
  const execution = inspectProductionValidationExecution(
    { workspaceId, manifest },
    { sources, runs: getExecutionLedgerRepository() },
  );
  const pipeline = inspectProductionValidationPipeline(
    { workspaceId, manifest },
    {
      sources,
      artifacts: getRawArtifactRepository(),
      conversionRuns: getConversionRunLedgerRepository(),
      staging: getStagingContentRepository(),
    },
  );
  const compatibility = new SqliteSourceCompatibilityObservationRepository(
    getRegistryDatabase(),
  ).latest(manifest.targets.map((target) => target.id));
  const structuredRemediation = structuredRemediationFacts(workspaceId, manifest.targets);
  const scorecard = buildProductionValidationScorecard({
    manifest,
    onboarding,
    execution,
    pipeline,
    compatibility,
    structuredRemediation,
  });
  return { manifest, onboarding, execution, pipeline, scorecard };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const resolvedWorkspaceId = resolveProductionValidationWorkspaceId(
      url.searchParams.get("workspaceId"),
    );
    resolveOperatorServiceReadAccess(request, resolvedWorkspaceId);
    const current = inspectCurrentWave(resolvedWorkspaceId);
    const scorecardSnapshots = new SqliteProductionValidationScorecardSnapshotRepository(
      getRegistryDatabase(),
    ).list({
      workspaceId: resolvedWorkspaceId,
      waveId: current.manifest.waveId,
      limit: 20,
    });
    return NextResponse.json({ ...current, scorecardSnapshots }, { status: 200 });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const manifest = loadProductionValidationWave();
    const resolvedWorkspaceId = resolveProductionValidationWorkspaceId(body.workspaceId);
    resolveOperatorServiceMutationAccess(request, resolvedWorkspaceId);
    if (body.action === SCORECARD_CAPTURE_ACTION) {
      const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
      if (!idempotencyKey) {
        throw new RegistryValidationError(
          "Idempotency-Key header is required to capture a scorecard snapshot",
        );
      }
      const repository = new SqliteProductionValidationScorecardSnapshotRepository(
        getRegistryDatabase(),
      );
      const existing = repository.findByIdempotencyKey({
        workspaceId: resolvedWorkspaceId,
        waveId: manifest.waveId,
        idempotencyKey,
      });
      const snapshot =
        existing ??
        repository.capture({
          scorecard: inspectCurrentWave(resolvedWorkspaceId).scorecard,
          idempotencyKey,
        });
      return NextResponse.json({ snapshot }, { status: existing ? 200 : 201 });
    }
    if (body.action !== undefined && body.action !== "QUEUE_DISCOVERY") {
      throw new RegistryValidationError(
        `Unsupported production validation action: ${String(body.action)}`,
      );
    }
    const result = withRegistryTransaction(() =>
      queueProductionValidationWaveForDiscovery(
        { workspaceId: resolvedWorkspaceId, manifest },
        {
          sources: getSourceRepository(),
          discovery: getSourceDiscoveryRepository(),
        },
      ),
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return apiError(error);
  }
}
