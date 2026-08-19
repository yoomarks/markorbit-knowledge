import { NextResponse } from "next/server";
import { queueProductionValidationWaveForDiscovery } from "@markorbit/persistence/production-validation-discovery-intake";
import { inspectProductionValidationExecution } from "@markorbit/persistence/production-validation-execution-status";
import { inspectProductionValidationOnboarding } from "@markorbit/persistence/production-validation-onboarding-status";
import { inspectProductionValidationPipeline } from "@markorbit/persistence/production-validation-pipeline-status";
import { buildProductionValidationScorecard } from "@markorbit/persistence/production-validation-scorecard";
import { SqliteSourceCompatibilityObservationRepository } from "@markorbit/persistence/source-compatibility-observations";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
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
    const scorecard = buildProductionValidationScorecard({
      manifest,
      onboarding,
      execution,
      pipeline,
      compatibility,
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
