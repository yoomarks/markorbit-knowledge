import { NextResponse } from "next/server";
import { DEFAULT_WORKSPACE, RegistryValidationError } from "@markorbit/persistence";
import { queueProductionValidationWaveForDiscovery } from "@markorbit/persistence/production-validation-discovery-intake";
import { inspectProductionValidationExecution } from "@markorbit/persistence/production-validation-execution-status";
import { inspectProductionValidationOnboarding } from "@markorbit/persistence/production-validation-onboarding-status";
import { inspectProductionValidationPipeline } from "@markorbit/persistence/production-validation-pipeline-status";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { loadProductionValidationWave } from "@/server/production-validation-wave";
import {
  getConversionRunLedgerRepository,
  getExecutionLedgerRepository,
  getRawArtifactRepository,
  getSourceDiscoveryRepository,
  getSourceRepository,
  getStagingContentRepository,
  withRegistryTransaction,
} from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function productionValidationWorkspaceId(value: unknown): string {
  if (value === null || value === undefined || value === "") return DEFAULT_WORKSPACE.id;
  if (typeof value !== "string" || !value.trim()) {
    throw new RegistryValidationError("workspaceId must be a non-empty string");
  }
  const workspaceId = value.trim();
  if (workspaceId !== DEFAULT_WORKSPACE.id) {
    throw new RegistryValidationError(
      `Production validation currently supports only workspace ${DEFAULT_WORKSPACE.id}`,
    );
  }
  return workspaceId;
}

export async function GET(request: Request) {
  try {
    const manifest = loadProductionValidationWave();
    const url = new URL(request.url);
    const resolvedWorkspaceId = productionValidationWorkspaceId(url.searchParams.get("workspaceId"));
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
    return NextResponse.json({ manifest, onboarding, execution, pipeline }, { status: 200 });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const manifest = loadProductionValidationWave();
    const resolvedWorkspaceId = productionValidationWorkspaceId(body.workspaceId);
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
