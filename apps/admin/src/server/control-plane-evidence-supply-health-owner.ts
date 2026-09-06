import type { DatabaseSync } from "node:sqlite";
import type {
  ControlPlaneEvidenceSupplyHealthOwnerItemV1,
  ControlPlaneEvidenceSupplyHealthOwnerResultV1,
  SourceCoverageTarget,
} from "@markorbit/contracts";
import {
  CONTROL_PLANE_EVIDENCE_SUPPLY_HEALTH_OWNER_PROTOCOL_VERSION,
  CONTROL_PLANE_KNOWLEDGE_READ_AUTHORITY,
} from "@markorbit/contracts";
import { SqliteEvidenceSupplyHealthRepository } from "@markorbit/persistence/evidence-supply-health";
import { listSourceCoverageTargets } from "@markorbit/persistence/source-coverage";
import { getRegistryDatabase } from "./source-registry";

export type ControlPlaneEvidenceSupplyHealthOwnerDependencies = {
  database?: DatabaseSync;
  observedAt?: Date;
  targets?: readonly SourceCoverageTarget[];
};

function activeTargets(targets: readonly SourceCoverageTarget[]): SourceCoverageTarget[] {
  return targets.filter((target) => target.catalogState !== "RETIRED");
}
function projectItem(
  target: SourceCoverageTarget,
  item: ReturnType<SqliteEvidenceSupplyHealthRepository["list"]>["items"][number],
): ControlPlaneEvidenceSupplyHealthOwnerItemV1 {
  return {
    targetId: item.targetId,
    jurisdiction: target.jurisdiction,
    authorityName: target.authorityName,
    authorityLevel: target.authorityLevel,
    family: target.family,
    displayName: target.displayName,
    sourceIds: [...item.sourceIds],
    state: item.state,
    reasonCodes: [...item.reasonCodes],
    coverage: structuredClone(item.coverage),
    freshness: structuredClone(item.freshness),
    schedule: structuredClone(item.schedule),
    currentRun: structuredClone(item.currentRun),
    reliability: structuredClone(item.reliability),
    latency: structuredClone(item.latency),
    changeActivity: structuredClone(item.changeActivity),
    observedAt: item.observedAt,
  };
}
export function getControlPlaneEvidenceSupplyHealthOwnerView(
  workspaceId: string,
  dependencies: ControlPlaneEvidenceSupplyHealthOwnerDependencies = {},
): ControlPlaneEvidenceSupplyHealthOwnerResultV1 {
  const database = dependencies.database ?? getRegistryDatabase();
  const result = new SqliteEvidenceSupplyHealthRepository(database).list({
    workspaceId,
    observedAt: dependencies.observedAt,
  });
  if (result.workspaceId !== workspaceId.trim()) {
    throw new Error("Evidence Supply Health workspace mismatch");
  }

  const targets = activeTargets(dependencies.targets ?? listSourceCoverageTargets());
  const targetById = new Map(targets.map((target) => [target.id, target]));
  const items = result.items.map((item) => {
    if (item.workspaceId !== result.workspaceId) {
      throw new Error(`Evidence Supply Health item workspace mismatch for ${item.targetId}`);
    }
    const target = targetById.get(item.targetId);
    if (!target) throw new Error(`Evidence Supply Health target ${item.targetId} is unavailable`);
    return projectItem(target, item);
  });

  return {
    protocolVersion: CONTROL_PLANE_EVIDENCE_SUPPLY_HEALTH_OWNER_PROTOCOL_VERSION,
    objectType: "CONTROL_PLANE_EVIDENCE_SUPPLY_HEALTH_OWNER_RESULT",
    owner: "KNOWLEDGE",
    access: "READ_ONLY",
    requiredUpstreamAuthority: CONTROL_PLANE_KNOWLEDGE_READ_AUTHORITY,
    sourceReadModel: "evidence-supply-health.v1",
    workspaceId: result.workspaceId,
    observedAt: result.observedAt,
    items,
    summary: structuredClone(result.summary),
  };
}
