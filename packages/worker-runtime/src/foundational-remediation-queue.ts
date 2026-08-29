import type {
  FoundationalReadinessGate,
  FoundationalReadinessStage,
  FoundationalReadinessTarget,
} from "./foundational-readiness";

export const FOUNDATIONAL_REMEDIATION_QUEUE_PROTOCOL_VERSION = "1.1" as const;

export type FoundationalRemediationActionCode =
  | "REGISTER_SOURCE"
  | "DISPATCH_GOVERNED_COLLECTION"
  | "REVIEW_INGEST_EVIDENCE"
  | "RUN_CONVERSION_RECOVERY"
  | "REINDEX_VERIFIED_CANONICAL"
  | "OPEN_RETRIEVAL_REMEDIATION_PLAN"
  | "REVIEW_RELEVANCE_AUDIT_COVERAGE"
  | "REVIEW_RELEVANCE_PROBE_CONFIG"
  | "REVIEW_SOURCE_FILTERED_RETRIEVAL"
  | "REVIEW_GLOBAL_RETRIEVAL_RANKING"
  | "REVIEW_RELEVANCE_AUDIT"
  | "REPROBE_SOURCE_COMPATIBILITY"
  | "REVIEW_SUPPLY_HEALTH";

export type FoundationalRemediationExecutionPath =
  | "MANUAL_OPERATOR"
  | "FOUNDATIONAL_OPERATOR_EXPLICIT_DISPATCH"
  | "CONVERSION_RECOVERY"
  | "CANONICAL_INDEXING"
  | "M16_PLANNER_THEN_M17_EXPLICIT_OPERATOR"
  | "M18_RELEVANCE_AUDIT";

export type FoundationalRemediationAction = {
  code: FoundationalRemediationActionCode;
  stage: Exclude<FoundationalReadinessStage, "READY">;
  gapCodes: string[];
  operatorInstruction: string;
  executionPath: FoundationalRemediationExecutionPath;
  collectionAuthorizationRequired: boolean;
  automaticExecution: false;
  endpoint: string | null;
};

export type FoundationalRemediationQueueItem = {
  targetId: string;
  jurisdiction: string;
  priority: number;
  stage: Exclude<FoundationalReadinessStage, "READY">;
  reason: string | null;
  gaps: string[];
  healthState: FoundationalReadinessTarget["healthState"];
  retrievalQualityState: FoundationalReadinessTarget["retrievalQualityState"];
  retrievalRelevanceState: FoundationalReadinessTarget["retrievalRelevanceState"];
  actions: FoundationalRemediationAction[];
};

export type FoundationalRemediationQueue = {
  protocolVersion: typeof FOUNDATIONAL_REMEDIATION_QUEUE_PROTOCOL_VERSION;
  objectType: "FOUNDATIONAL_REMEDIATION_QUEUE";
  jurisdiction: string;
  state: "CLEAR" | "ACTION_REQUIRED";
  totalTargetCount: number;
  actionableTargetCount: number;
  byStage: Partial<Record<Exclude<FoundationalReadinessStage, "READY">, number>>;
  items: FoundationalRemediationQueueItem[];
  executionPolicy: "ADVISORY_ONLY";
  collectionAuthorization: "UNCHANGED_EXPLICIT_ONLY";
  semanticJudgment: false;
};

const STAGE_PRIORITY: Record<Exclude<FoundationalReadinessStage, "READY">, number> = {
  REGISTER: 10,
  COLLECT: 20,
  INGEST: 30,
  CONVERT: 40,
  INDEX: 50,
  QUALITY: 60,
  RELEVANCE: 70,
  HEALTH: 80,
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function targetQueryEndpoint(
  path: string,
  workspaceId: string,
  jurisdiction: string,
  targetId: string,
): string {
  const query = new URLSearchParams({ workspaceId, jurisdiction, targetId });
  return `${path}?${query.toString()}`;
}

function action(
  target: FoundationalReadinessTarget,
  code: FoundationalRemediationActionCode,
  instruction: string,
  executionPath: FoundationalRemediationExecutionPath,
  gapCodes: string[],
  endpoint: string | null = null,
  collectionAuthorizationRequired = false,
): FoundationalRemediationAction {
  if (target.stage === "READY") {
    throw new Error(`READY target ${target.targetId} cannot create a remediation action`);
  }
  return {
    code,
    stage: target.stage,
    gapCodes,
    operatorInstruction: instruction,
    executionPath,
    collectionAuthorizationRequired,
    automaticExecution: false,
    endpoint,
  };
}

function relevanceActions(
  target: FoundationalReadinessTarget,
  workspaceId: string,
  jurisdiction: string,
): FoundationalRemediationAction[] {
  const gaps = unique(target.retrievalRelevanceGaps);
  const endpoint = targetQueryEndpoint(
    "/api/retrieval/relevance-audit",
    workspaceId,
    jurisdiction,
    target.targetId,
  );
  const actions: FoundationalRemediationAction[] = [];
  const coverageGaps = gaps.filter((gap) =>
    [
      "RETRIEVAL_RELEVANCE_AUDIT_MISSING",
      "RETRIEVAL_RELEVANCE_AUDIT_DUPLICATE",
      "RETRIEVAL_RELEVANCE_NOT_APPLICABLE_WITH_CURRENT_DOCUMENTS",
    ].includes(gap),
  );
  if (coverageGaps.length > 0) {
    actions.push(
      action(
        target,
        "REVIEW_RELEVANCE_AUDIT_COVERAGE",
        "Re-run and inspect the deterministic M18 relevance audit for this target. Reconcile missing, duplicate, or inconsistent audit coverage without inventing results or bypassing the readiness gate.",
        "M18_RELEVANCE_AUDIT",
        coverageGaps,
        endpoint,
      ),
    );
  }
  if (gaps.includes("PROBE_NOT_CONFIGURED")) {
    actions.push(
      action(
        target,
        "REVIEW_RELEVANCE_PROBE_CONFIG",
        "Review the explicit curated smoke-probe configuration for this foundational target. Add or correct a deterministic operational probe only through code review; do not generate probes from an LLM at runtime.",
        "M18_RELEVANCE_AUDIT",
        ["PROBE_NOT_CONFIGURED"],
        endpoint,
      ),
    );
  }
  if (gaps.includes("SOURCE_FILTERED_QUERY_MISS")) {
    actions.push(
      action(
        target,
        "REVIEW_SOURCE_FILTERED_RETRIEVAL",
        "Inspect the expected source's current retrieval document, chunks, FTS projection, and smoke query. Fix upstream indexing or curated probe configuration as appropriate; do not silently relax the expected-source check.",
        "M18_RELEVANCE_AUDIT",
        ["SOURCE_FILTERED_QUERY_MISS"],
        endpoint,
      ),
    );
  }
  if (gaps.includes("GLOBAL_TOP_K_MISS")) {
    actions.push(
      action(
        target,
        "REVIEW_GLOBAL_RETRIEVAL_RANKING",
        "Inspect the deterministic BM25 top-K result set and the curated smoke query. Treat this as retrieval-plumbing review only; do not claim semantic or legal relevance and do not auto-tune ranking.",
        "M18_RELEVANCE_AUDIT",
        ["GLOBAL_TOP_K_MISS"],
        endpoint,
      ),
    );
  }
  if (actions.length === 0) {
    actions.push(
      action(
        target,
        "REVIEW_RELEVANCE_AUDIT",
        "Inspect the deterministic M18 relevance audit for the target and resolve the reported operational retrieval issue before marking foundational supply READY.",
        "M18_RELEVANCE_AUDIT",
        gaps,
        endpoint,
      ),
    );
  }
  return actions;
}

function actionsFor(
  target: FoundationalReadinessTarget,
  workspaceId: string,
  jurisdiction: string,
): FoundationalRemediationAction[] {
  if (target.stage === "READY") return [];
  const gaps = unique([
    ...target.gaps,
    ...target.retrievalAuditGaps,
    ...target.retrievalRelevanceGaps,
  ]);
  switch (target.stage) {
    case "REGISTER":
      return [
        action(
          target,
          "REGISTER_SOURCE",
          "Register or reconcile the explicitly curated source definition for this coverage target before acquisition. Registration does not authorize collection.",
          "MANUAL_OPERATOR",
          gaps,
        ),
      ];
    case "COLLECT":
      return [
        action(
          target,
          "DISPATCH_GOVERNED_COLLECTION",
          "Review the prepared foundational plan and dispatch this target only with explicit operator approval. Do not broaden the source scope or create autonomous collection authorization.",
          "FOUNDATIONAL_OPERATOR_EXPLICIT_DISPATCH",
          gaps,
          null,
          true,
        ),
      ];
    case "INGEST":
      return [
        action(
          target,
          "REVIEW_INGEST_EVIDENCE",
          "Inspect the completed collection run for immutable RawArtifact evidence and ingest only verifiable captured bytes. Do not fabricate a missing artifact record.",
          "MANUAL_OPERATOR",
          gaps,
        ),
      ];
    case "CONVERT":
      return [
        action(
          target,
          "RUN_CONVERSION_RECOVERY",
          "Use the governed conversion-recovery workflow for the captured artifact. Preserve failed conversion history and create retry runs rather than overwriting prior evidence.",
          "CONVERSION_RECOVERY",
          gaps,
          targetQueryEndpoint(
            "/api/foundational/conversion-recovery",
            workspaceId,
            jurisdiction,
            target.targetId,
          ),
        ),
      ];
    case "INDEX":
      return [
        action(
          target,
          "REINDEX_VERIFIED_CANONICAL",
          "Index the verified ReadyPackage/canonical Markdown through the existing retrieval-index boundary. Do not synthesize canonical bytes or mutate immutable raw evidence.",
          "CANONICAL_INDEXING",
          gaps,
          targetQueryEndpoint(
            "/api/foundational/verified-canonical-reindex",
            workspaceId,
            jurisdiction,
            target.targetId,
          ),
        ),
      ];
    case "QUALITY":
      return [
        action(
          target,
          "OPEN_RETRIEVAL_REMEDIATION_PLAN",
          "Open the M16 structural remediation plan for the reported audit gaps. Execute only M17 actions that are explicitly operator-approved and policy-eligible; provenance restoration and duplicate review remain manual.",
          "M16_PLANNER_THEN_M17_EXPLICIT_OPERATOR",
          target.retrievalAuditGaps,
          targetQueryEndpoint(
            "/api/foundational/retrieval-quality-remediation",
            workspaceId,
            jurisdiction,
            target.targetId,
          ),
        ),
      ];
    case "RELEVANCE":
      return relevanceActions(target, workspaceId, jurisdiction);
    case "HEALTH":
      if (target.compatibilityFreshness === "STALE") {
        return [
          action(
            target,
            "REPROBE_SOURCE_COMPATIBILITY",
            "Re-run the curated representative compatibility canary for this target through the controlled Worker runtime and persist the fresh result only through the authenticated Worker compatibility intake. Do not execute the production write path from the browser and do not grant CI production credentials.",
            "MANUAL_OPERATOR",
            ["SOURCE_COMPATIBILITY_OBSERVATION_STALE"],
          ),
        ];
      }
      return [
        action(
          target,
          "REVIEW_SUPPLY_HEALTH",
          "Inspect source supply health and resolve the reported operational gap without bypassing acquisition, normalization, indexing, quality, or relevance gates.",
          "MANUAL_OPERATOR",
          gaps,
          `${targetQueryEndpoint(
            "/api/source-supply-health",
            workspaceId,
            jurisdiction,
            target.targetId,
          )}&coverageTier=FOUNDATIONAL&catalogState=ACTIVE`,
        ),
      ];
  }
}

export function buildFoundationalRemediationQueue(
  readiness: FoundationalReadinessGate,
  workspaceId: string,
): FoundationalRemediationQueue {
  const normalizedWorkspaceId = workspaceId.trim();
  if (!normalizedWorkspaceId) throw new Error("workspaceId is required");
  const items = readiness.targets
    .filter((target) => target.stage !== "READY")
    .map((target): FoundationalRemediationQueueItem => {
      if (target.stage === "READY") throw new Error("Unexpected READY target");
      return {
        targetId: target.targetId,
        jurisdiction: readiness.jurisdiction,
        priority: STAGE_PRIORITY[target.stage],
        stage: target.stage,
        reason: target.reason,
        gaps: unique([
          ...target.gaps,
          ...target.retrievalAuditGaps,
          ...target.retrievalRelevanceGaps,
        ]),
        healthState: target.healthState,
        retrievalQualityState: target.retrievalQualityState,
        retrievalRelevanceState: target.retrievalRelevanceState,
        actions: actionsFor(target, normalizedWorkspaceId, readiness.jurisdiction),
      };
    })
    .sort(
      (left, right) =>
        left.priority - right.priority || left.targetId.localeCompare(right.targetId),
    );
  const byStage: FoundationalRemediationQueue["byStage"] = {};
  for (const item of items) byStage[item.stage] = (byStage[item.stage] ?? 0) + 1;
  return {
    protocolVersion: FOUNDATIONAL_REMEDIATION_QUEUE_PROTOCOL_VERSION,
    objectType: "FOUNDATIONAL_REMEDIATION_QUEUE",
    jurisdiction: readiness.jurisdiction,
    state: items.length === 0 ? "CLEAR" : "ACTION_REQUIRED",
    totalTargetCount: readiness.totalCount,
    actionableTargetCount: items.length,
    byStage,
    items,
    executionPolicy: "ADVISORY_ONLY",
    collectionAuthorization: "UNCHANGED_EXPLICIT_ONLY",
    semanticJudgment: false,
  };
}
