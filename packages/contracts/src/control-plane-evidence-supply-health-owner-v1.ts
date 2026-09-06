import type {
  EvidenceSupplyChangeActivityFacts,
  EvidenceSupplyCoverageFacts,
  EvidenceSupplyFreshnessFacts,
  EvidenceSupplyHealthReasonCode,
  EvidenceSupplyHealthState,
  EvidenceSupplyHealthSummaryV1,
  EvidenceSupplyLatencyFacts,
  EvidenceSupplyReliabilityFacts,
  EvidenceSupplyScheduleFacts,
} from "./evidence-supply-health-v1";
import type { AuthorityLevel } from "./schema-v1";
import type { SourceCoverageFamily } from "./source-coverage-v1";
import type { SourceSupplyLatestRun } from "./source-supply-health-v1";

export const CONTROL_PLANE_EVIDENCE_SUPPLY_HEALTH_OWNER_PROTOCOL_VERSION = "1.0" as const;
export const CONTROL_PLANE_KNOWLEDGE_READ_AUTHORITY = "control-plane:knowledge:read" as const;

export type ControlPlaneEvidenceSupplyHealthOwnerItemV1 = {
  targetId: string;
  jurisdiction: string;
  authorityName: string;
  authorityLevel: AuthorityLevel;
  family: SourceCoverageFamily;
  displayName: string;
  sourceIds: string[];
  state: EvidenceSupplyHealthState;
  reasonCodes: EvidenceSupplyHealthReasonCode[];
  coverage: EvidenceSupplyCoverageFacts;
  freshness: EvidenceSupplyFreshnessFacts;
  schedule: EvidenceSupplyScheduleFacts;
  currentRun: SourceSupplyLatestRun;
  reliability: EvidenceSupplyReliabilityFacts;
  latency: EvidenceSupplyLatencyFacts;
  changeActivity: EvidenceSupplyChangeActivityFacts;
  observedAt: string;
};

export type ControlPlaneEvidenceSupplyHealthOwnerResultV1 = {
  protocolVersion: typeof CONTROL_PLANE_EVIDENCE_SUPPLY_HEALTH_OWNER_PROTOCOL_VERSION;
  objectType: "CONTROL_PLANE_EVIDENCE_SUPPLY_HEALTH_OWNER_RESULT";
  owner: "KNOWLEDGE";
  access: "READ_ONLY";
  requiredUpstreamAuthority: typeof CONTROL_PLANE_KNOWLEDGE_READ_AUTHORITY;
  sourceReadModel: "evidence-supply-health.v1";
  workspaceId: string;
  observedAt: string;
  items: ControlPlaneEvidenceSupplyHealthOwnerItemV1[];
  summary: EvidenceSupplyHealthSummaryV1;
};
