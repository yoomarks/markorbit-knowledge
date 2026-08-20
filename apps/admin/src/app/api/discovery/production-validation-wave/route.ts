import { NextResponse } from "next/server";
import { queueProductionValidationWaveForDiscovery } from "@markorbit/persistence/production-validation-discovery-intake";
import { inspectProductionValidationExecution } from "@markorbit/persistence/production-validation-execution-status";
import { inspectProductionValidationOnboarding } from "@markorbit/persistence/production-validation-onboarding-status";
import { inspectProductionValidationPipeline } from "@markorbit/persistence/production-validation-pipeline-status";
import {
  buildProductionValidationScorecard,
  type ProductionValidationStructuredRemediationTelemetry,
} from "@markorbit/persistence/production-validation-scorecard";
import { SqliteSourceCompatibilityObservationRepository } from "@markorbit/persistence/source-compatibility-observations";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { buildFoundationalRemediationQueueSnapshot } from "@/server/foundational-remediation-queue";
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

export async function GET(request: Request) {
  try {
    const manifest = loadProductionValidationWave();
    const url = new URL(request.url);
    const resolvedWorkspaceId = resolveProductionValidationWorkspaceId(
      url.searchParams.get("workspaceId"),
    );
    const sources = getSourceRepository();
    const onboarding = inspectProductionValidationOnboarding(
      { workspaceId: resolvedWorkspaceId, manifest },
      {
        sources,
        discovery: getSourceDiscoveryRepository(),
      },
    );
    const execution = inspectProductionValidationExecution(
      { workspaceId: resolvedWorkspaceId, manifest },
      {
        sources,
        runs: getExecutionLedgerRepository(),
      },
    );
    const pipeline = inspectProductionValidationPipeline(
      { workspaceId: resolvedWorkspaceId, manifest },
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
    const structuredRemediation = structuredRemediationFacts(resolvedWorkspaceId, manifest.targets);
    const scorecard = buildProductionValidationScorecard({
      manifest,
      onboarding,
      execution,
      pipeline,
      compatibility,
      structuredRemediation,
    });
    return NextResponse.json(
      { manifest, onboarding, execution, pipeline, scorecard },
      { status: 200 },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const manifest = loadProductionValidationWave();
    const resolvedWorkspaceId = resolveProductionValidationWorkspaceId(body.workspaceId);
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
