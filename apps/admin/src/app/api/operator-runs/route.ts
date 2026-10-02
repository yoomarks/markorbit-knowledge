import { NextResponse } from "next/server";
import {
  CROSS_SOURCE_PARENT_ARTIFACT_IDS_EXTENSION,
  type Extensions,
  type SourceDefinition,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { CollectionPlanNotFoundError } from "@markorbit/persistence/collection-plans";
import { GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_ID } from "@markorbit/worker-runtime";
import { apiError, readJson, requireRecord } from "../../../server/api-errors";
import { parseCnipaManualRunExtensions } from "../../../server/cnipa-run-override";
import {
  assertOperatorServiceResourceWorkspace,
  resolveOperatorServiceMutationAccess,
} from "../../../server/operator-service-api-access";
import {
  getCollectionPlanRepository,
  getExecutionLedgerRepository,
  getSourceRepository,
} from "../../../server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ARTIFACT_ID = /^art_[0-9A-HJKMNP-TV-Z]{26}$/u;

function globalTrademarkParentGrant(source: SourceDefinition): Extensions | undefined {
  if (source.connector.connectorId !== GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_ID) {
    return undefined;
  }
  const config = source.connectorConfig;
  const references =
    config.intent === "PUBLISH_DURABLE_REQUEST"
      ? [config.requestArtifactRef]
      : config.intent === "PUBLISH_DURABLE_REQUEST_BATCH"
        ? config.requestArtifactRefs
        : undefined;
  if (!Array.isArray(references) || references.length < 1 || references.length > 500) {
    throw new RegistryValidationError(
      "Global trademark publisher source must identify a durable request artifact",
    );
  }
  const artifactIds = references.map((reference) =>
    typeof reference === "object" && reference !== null && !Array.isArray(reference)
      ? (reference as Record<string, unknown>).artifactId
      : undefined,
  );
  if (
    artifactIds.some(
      (artifactId) => typeof artifactId !== "string" || !ARTIFACT_ID.test(artifactId),
    ) ||
    new Set(artifactIds).size !== artifactIds.length
  ) {
    throw new RegistryValidationError(
      "Global trademark publisher source must identify unique durable request artifacts",
    );
  }
  return { [CROSS_SOURCE_PARENT_ARTIFACT_IDS_EXTENSION]: artifactIds as string[] };
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const allowed = new Set(["planId", "extensions"]);
    if (Object.keys(body).some((key) => !allowed.has(key))) {
      throw new RegistryValidationError("Unknown manual dispatch field");
    }
    if (typeof body.planId !== "string") {
      throw new RegistryValidationError("planId is required");
    }

    const plan = getCollectionPlanRepository().getById(body.planId);
    if (!plan) throw new CollectionPlanNotFoundError(body.planId);

    const access = resolveOperatorServiceMutationAccess(request, plan.plan.workspaceId);
    assertOperatorServiceResourceWorkspace(access, plan.plan.workspaceId);

    const source = getSourceRepository().getById(plan.plan.sourceId);
    if (!source) throw new RegistryValidationError("CollectionPlan source was not found");
    assertOperatorServiceResourceWorkspace(access, source.workspaceId);

    const idempotencyKey = request.headers.get("Idempotency-Key");
    const extensions =
      parseCnipaManualRunExtensions({
        rawExtensions: body.extensions,
        planExtensions: plan.plan.extensions,
        idempotencyKey,
      }) ?? globalTrademarkParentGrant(source);
    const result = getExecutionLedgerRepository().dispatchManual({
      planId: body.planId,
      requestedBy: { actorType: "API_CLIENT", actorId: access.principal.userId },
      ...(idempotencyKey ? { idempotencyKey } : {}),
      ...(extensions ? { extensions } : {}),
    });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
