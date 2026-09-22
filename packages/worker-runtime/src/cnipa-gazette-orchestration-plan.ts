import { createHash } from "node:crypto";
import {
  cnipaGazetteBrowserAuthorityPlan,
  type CnipaGazetteBrowserAuthorityPlan,
  type CnipaGazetteBrowserAuthorityResumeFrom,
} from "./cnipa-gazette-browser-authority-plan";

export const CNIPA_GAZETTE_ORCHESTRATION_AUTHORITY_MODE = "INTERNAL_SERVICE_GO_V1" as const;
export const CNIPA_GAZETTE_ORCHESTRATION_STAGE = "MULTI_ISSUE_ORCHESTRATION" as const;
export const CNIPA_GAZETTE_ORCHESTRATION_MAX_ISSUES = 100;
export const CNIPA_GAZETTE_ORCHESTRATION_MIN_ISSUE = 73;

export type CnipaGazetteOrchestrationPurpose = "HISTORICAL_BACKFILL" | "INCREMENTAL_CATCHUP";

export type CnipaGazetteOrchestrationIssueSelection =
  | {
      mode: "RANGE";
      startIssue: number;
      endIssue: number;
    }
  | {
      mode: "EXPLICIT";
      issues: readonly number[];
    };

export type CnipaGazetteOrchestrationBrowserTemplate = {
  targetLogicalPagesPerCheckpoint: number;
  maxRuntimeSeconds: number;
  captureToolVersion: "1.0.3";
  captureToolBundleName: string;
  captureToolBundleSha256: string;
};

export type CnipaGazetteOrchestrationPlan = {
  version: 1;
  operationId: string;
  workspaceId: string;
  authorityMode: typeof CNIPA_GAZETTE_ORCHESTRATION_AUTHORITY_MODE;
  stage: typeof CNIPA_GAZETTE_ORCHESTRATION_STAGE;
  purpose: CnipaGazetteOrchestrationPurpose;
  issueSelection: CnipaGazetteOrchestrationIssueSelection;
  observedMaxIssue?: number;
  announcementTypeSelection: "ALL";
  anncType: "";
  concurrency: 1;
  browserTemplate: CnipaGazetteOrchestrationBrowserTemplate;
  dataEngineMutation: "DISABLED";
  historicalReplayActivated: boolean;
};

export type CnipaGazetteOrchestrationIssueEvidence = {
  announcementIssue: number;
  browser?: {
    stateArtifactId: string;
    completed: boolean;
    nextSourcePageIndex: number;
    rowsSeen: number;
    resumeFrom?: CnipaGazetteBrowserAuthorityResumeFrom;
  };
  admission?: {
    sourceDatasetSha256: string;
    finalizeReceiptArtifactId: string;
  };
};

export type CnipaGazetteOrchestrationIssueStatus = "COMPLETED" | "RESUME" | "PENDING";
export type CnipaGazetteOrchestrationNextAction =
  "NONE" | "RESUME_CAPTURE" | "BUILD_ADMISSION" | "START_CAPTURE";

export type CnipaGazetteOrchestrationIssueProgress = {
  announcementIssue: number;
  status: CnipaGazetteOrchestrationIssueStatus;
  nextAction: CnipaGazetteOrchestrationNextAction;
  stateArtifactId?: string;
  sourceDatasetSha256?: string;
  finalizeReceiptArtifactId?: string;
};

export type CnipaGazetteOrchestrationProgress = {
  version: 1;
  operationId: string;
  planSha256: string;
  workspaceId: string;
  issues: readonly CnipaGazetteOrchestrationIssueProgress[];
  counts: {
    total: number;
    completed: number;
    resume: number;
    pending: number;
  };
  nextIssue: number | null;
  completed: boolean;
};

const OPERATION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const WORKSPACE_ID = /^wsp_[0-9A-HJKMNP-TV-Z]{26}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ARTIFACT_ID = /^art_[0-9A-HJKMNP-TV-Z]{26}$/u;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`CNIPA Gazette orchestration plan invalid: ${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const accepted = new Set(allowed);
  const extras = Object.keys(value).filter((key) => !accepted.has(key));
  if (extras.length > 0) {
    throw new TypeError(
      `CNIPA Gazette orchestration plan invalid: ${label} contains unsupported keys: ${extras.join(", ")}`,
    );
  }
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new TypeError(
      `CNIPA Gazette orchestration plan invalid: ${label} must be an integer in ${minimum}..${maximum}`,
    );
  }
  return value;
}

function artifactId(value: unknown, label: string): string {
  if (typeof value !== "string" || !ARTIFACT_ID.test(value)) {
    throw new TypeError(
      `CNIPA Gazette orchestration evidence invalid: ${label} must be a RawArtifact id`,
    );
  }
  return value;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new TypeError(
      `CNIPA Gazette orchestration evidence invalid: ${label} must be lowercase SHA-256`,
    );
  }
  return value;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function parseIssueSelection(value: unknown): CnipaGazetteOrchestrationIssueSelection {
  const selection = objectValue(value, "issueSelection");
  if (selection.mode === "RANGE") {
    exactKeys(selection, ["mode", "startIssue", "endIssue"], "issueSelection");
    const startIssue = integer(
      selection.startIssue,
      "issueSelection.startIssue",
      CNIPA_GAZETTE_ORCHESTRATION_MIN_ISSUE,
      999999,
    );
    const endIssue = integer(
      selection.endIssue,
      "issueSelection.endIssue",
      CNIPA_GAZETTE_ORCHESTRATION_MIN_ISSUE,
      999999,
    );
    if (endIssue < startIssue) {
      throw new TypeError(
        "CNIPA Gazette orchestration plan invalid: issueSelection endIssue precedes startIssue",
      );
    }
    if (endIssue - startIssue + 1 > CNIPA_GAZETTE_ORCHESTRATION_MAX_ISSUES) {
      throw new TypeError(
        `CNIPA Gazette orchestration plan invalid: a frozen plan may contain at most ${CNIPA_GAZETTE_ORCHESTRATION_MAX_ISSUES} issues`,
      );
    }
    return { mode: "RANGE", startIssue, endIssue };
  }
  if (selection.mode === "EXPLICIT") {
    exactKeys(selection, ["mode", "issues"], "issueSelection");
    if (
      !Array.isArray(selection.issues) ||
      selection.issues.length < 1 ||
      selection.issues.length > CNIPA_GAZETTE_ORCHESTRATION_MAX_ISSUES
    ) {
      throw new TypeError(
        `CNIPA Gazette orchestration plan invalid: issueSelection.issues must contain 1..${CNIPA_GAZETTE_ORCHESTRATION_MAX_ISSUES} issues`,
      );
    }
    const issues = selection.issues.map((issue, index) =>
      integer(
        issue,
        `issueSelection.issues[${index}]`,
        CNIPA_GAZETTE_ORCHESTRATION_MIN_ISSUE,
        999999,
      ),
    );
    for (let index = 1; index < issues.length; index += 1) {
      if (issues[index]! <= issues[index - 1]!) {
        throw new TypeError(
          "CNIPA Gazette orchestration plan invalid: explicit issues must be unique and strictly ascending",
        );
      }
    }
    return { mode: "EXPLICIT", issues };
  }
  throw new TypeError(
    "CNIPA Gazette orchestration plan invalid: issueSelection.mode must be RANGE or EXPLICIT",
  );
}

function parseBrowserTemplate(value: unknown): CnipaGazetteOrchestrationBrowserTemplate {
  const template = objectValue(value, "browserTemplate");
  exactKeys(
    template,
    [
      "targetLogicalPagesPerCheckpoint",
      "maxRuntimeSeconds",
      "captureToolVersion",
      "captureToolBundleName",
      "captureToolBundleSha256",
    ],
    "browserTemplate",
  );
  const maxRuntimeSeconds = integer(
    template.maxRuntimeSeconds,
    "browserTemplate.maxRuntimeSeconds",
    60,
    3600,
  );
  if (
    template.captureToolVersion !== "1.0.3" ||
    typeof template.captureToolBundleName !== "string" ||
    !template.captureToolBundleName.trim() ||
    template.captureToolBundleName.length > 255 ||
    typeof template.captureToolBundleSha256 !== "string" ||
    !SHA256.test(template.captureToolBundleSha256)
  ) {
    throw new TypeError(
      "CNIPA Gazette orchestration plan invalid: frozen browser template mismatch",
    );
  }
  return {
    targetLogicalPagesPerCheckpoint: integer(
      template.targetLogicalPagesPerCheckpoint,
      "browserTemplate.targetLogicalPagesPerCheckpoint",
      1,
      100,
    ),
    maxRuntimeSeconds,
    captureToolVersion: "1.0.3",
    captureToolBundleName: template.captureToolBundleName.trim(),
    captureToolBundleSha256: template.captureToolBundleSha256,
  };
}

export function expandCnipaGazetteOrchestrationIssues(
  plan: Pick<CnipaGazetteOrchestrationPlan, "issueSelection">,
): number[] {
  const selection = plan.issueSelection;
  if (selection.mode === "EXPLICIT") return [...selection.issues];
  const startIssue = selection.startIssue;
  return Array.from(
    { length: selection.endIssue - startIssue + 1 },
    (_, index) => startIssue + index,
  );
}

export function parseCnipaGazetteOrchestrationPlan(value: unknown): CnipaGazetteOrchestrationPlan {
  const input = objectValue(value, "root");
  exactKeys(
    input,
    [
      "version",
      "operationId",
      "workspaceId",
      "authorityMode",
      "stage",
      "purpose",
      "issueSelection",
      "observedMaxIssue",
      "announcementTypeSelection",
      "anncType",
      "concurrency",
      "browserTemplate",
      "dataEngineMutation",
      "historicalReplayActivated",
    ],
    "root",
  );
  if (input.version !== 1) {
    throw new TypeError("CNIPA Gazette orchestration plan invalid: version must be 1");
  }
  if (typeof input.operationId !== "string" || !OPERATION_ID.test(input.operationId)) {
    throw new TypeError(
      "CNIPA Gazette orchestration plan invalid: operationId must be a lowercase slug",
    );
  }
  if (typeof input.workspaceId !== "string" || !WORKSPACE_ID.test(input.workspaceId)) {
    throw new TypeError("CNIPA Gazette orchestration plan invalid: workspaceId must be Schema v1");
  }
  if (
    input.authorityMode !== CNIPA_GAZETTE_ORCHESTRATION_AUTHORITY_MODE ||
    input.stage !== CNIPA_GAZETTE_ORCHESTRATION_STAGE ||
    (input.purpose !== "HISTORICAL_BACKFILL" && input.purpose !== "INCREMENTAL_CATCHUP") ||
    input.announcementTypeSelection !== "ALL" ||
    input.anncType !== "" ||
    input.concurrency !== 1 ||
    input.dataEngineMutation !== "DISABLED" ||
    typeof input.historicalReplayActivated !== "boolean"
  ) {
    throw new TypeError(
      "CNIPA Gazette orchestration plan invalid: frozen orchestration scope mismatch",
    );
  }

  const issueSelection = parseIssueSelection(input.issueSelection);
  const browserTemplate = parseBrowserTemplate(input.browserTemplate);
  const issues = expandCnipaGazetteOrchestrationIssues({ issueSelection });
  let observedMaxIssue: number | undefined;

  if (input.purpose === "HISTORICAL_BACKFILL") {
    if (input.historicalReplayActivated !== true || input.observedMaxIssue !== undefined) {
      throw new TypeError(
        "CNIPA Gazette orchestration plan invalid: historical backfill requires explicit historical replay and no dynamic max issue",
      );
    }
  } else {
    if (input.historicalReplayActivated !== false) {
      throw new TypeError(
        "CNIPA Gazette orchestration plan invalid: incremental catch-up must not activate historical replay",
      );
    }
    observedMaxIssue = integer(
      input.observedMaxIssue,
      "observedMaxIssue",
      CNIPA_GAZETTE_ORCHESTRATION_MIN_ISSUE,
      999999,
    );
    if (issues.some((issue) => issue > observedMaxIssue!)) {
      throw new TypeError(
        "CNIPA Gazette orchestration plan invalid: frozen incremental issues exceed observedMaxIssue",
      );
    }
  }

  return {
    version: 1,
    operationId: input.operationId,
    workspaceId: input.workspaceId,
    authorityMode: CNIPA_GAZETTE_ORCHESTRATION_AUTHORITY_MODE,
    stage: CNIPA_GAZETTE_ORCHESTRATION_STAGE,
    purpose: input.purpose,
    issueSelection,
    ...(observedMaxIssue !== undefined ? { observedMaxIssue } : {}),
    announcementTypeSelection: "ALL",
    anncType: "",
    concurrency: 1,
    browserTemplate,
    dataEngineMutation: "DISABLED",
    historicalReplayActivated: input.historicalReplayActivated,
  };
}

export function cnipaGazetteOrchestrationPlanSha256(plan: CnipaGazetteOrchestrationPlan): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(plan)))
    .digest("hex");
}

export function expectedCnipaGazetteOrchestrationAuthorityToken(
  plan: CnipaGazetteOrchestrationPlan,
  planSha256 = cnipaGazetteOrchestrationPlanSha256(plan),
): string {
  if (!SHA256.test(planSha256)) throw new TypeError("planSha256 must be lowercase SHA-256");
  return `GO #898 CNIPA-GAZETTE-ORCHESTRATION ${plan.operationId} ${plan.stage} ${planSha256}`;
}

export function deriveCnipaGazetteOrchestrationProgress(input: {
  plan: CnipaGazetteOrchestrationPlan;
  evidence?: readonly CnipaGazetteOrchestrationIssueEvidence[];
}): CnipaGazetteOrchestrationProgress {
  const plan = parseCnipaGazetteOrchestrationPlan(input.plan);
  const authorizedIssues = expandCnipaGazetteOrchestrationIssues(plan);
  const authorized = new Set(authorizedIssues);
  const evidenceByIssue = new Map<number, CnipaGazetteOrchestrationIssueEvidence>();

  for (const item of input.evidence ?? []) {
    if (!Number.isSafeInteger(item.announcementIssue) || !authorized.has(item.announcementIssue)) {
      throw new TypeError(
        "CNIPA Gazette orchestration evidence invalid: evidence issue is outside frozen authority",
      );
    }
    if (evidenceByIssue.has(item.announcementIssue)) {
      throw new TypeError(
        "CNIPA Gazette orchestration evidence invalid: duplicate evidence for announcement issue",
      );
    }
    if (item.admission && (!item.browser || item.browser.completed !== true)) {
      throw new TypeError(
        "CNIPA Gazette orchestration evidence invalid: finalized admission requires completed browser evidence",
      );
    }
    if (item.browser) {
      artifactId(item.browser.stateArtifactId, "browser.stateArtifactId");
      const nextSourcePageIndex = integer(
        item.browser.nextSourcePageIndex,
        "browser.nextSourcePageIndex",
        1,
        100000,
      );
      const rowsSeen = integer(
        item.browser.rowsSeen,
        "browser.rowsSeen",
        0,
        Number.MAX_SAFE_INTEGER,
      );
      if (typeof item.browser.completed !== "boolean") {
        throw new TypeError(
          "CNIPA Gazette orchestration evidence invalid: browser.completed must be boolean",
        );
      }
      if (!item.browser.completed && rowsSeen === 0 && nextSourcePageIndex !== 1) {
        throw new TypeError(
          "CNIPA Gazette orchestration evidence invalid: zero-row browser progress must remain at source page 1",
        );
      }
      if (!item.browser.completed && rowsSeen > 0) {
        if (!item.browser.resumeFrom) {
          throw new TypeError(
            "CNIPA Gazette orchestration evidence invalid: partial browser progress requires frozen resumeFrom refs",
          );
        }
        if (item.browser.resumeFrom.stateArtifactId !== item.browser.stateArtifactId) {
          throw new TypeError(
            "CNIPA Gazette orchestration evidence invalid: resumeFrom state artifact mismatch",
          );
        }
        cnipaGazetteBrowserAuthorityPlan({
          operationId: `evidence-${item.announcementIssue}-resume`,
          workspaceId: plan.workspaceId,
          dispatchMode: "PREPARE_ONLY",
          announcementIssue: item.announcementIssue,
          targetLogicalPagesPerCheckpoint: plan.browserTemplate.targetLogicalPagesPerCheckpoint,
          maxRuntimeSeconds: plan.browserTemplate.maxRuntimeSeconds,
          captureToolVersion: plan.browserTemplate.captureToolVersion,
          captureToolBundleName: plan.browserTemplate.captureToolBundleName,
          captureToolBundleSha256: plan.browserTemplate.captureToolBundleSha256,
          resumeFrom: item.browser.resumeFrom,
        });
      }
    }
    if (item.admission) {
      sha256(item.admission.sourceDatasetSha256, "admission.sourceDatasetSha256");
      artifactId(item.admission.finalizeReceiptArtifactId, "admission.finalizeReceiptArtifactId");
    }
    evidenceByIssue.set(item.announcementIssue, item);
  }

  const issues: CnipaGazetteOrchestrationIssueProgress[] = authorizedIssues.map(
    (announcementIssue) => {
      const item = evidenceByIssue.get(announcementIssue);
      if (item?.admission) {
        return {
          announcementIssue,
          status: "COMPLETED",
          nextAction: "NONE",
          stateArtifactId: item.browser!.stateArtifactId,
          sourceDatasetSha256: item.admission.sourceDatasetSha256,
          finalizeReceiptArtifactId: item.admission.finalizeReceiptArtifactId,
        };
      }
      if (item?.browser?.completed) {
        return {
          announcementIssue,
          status: "RESUME",
          nextAction: "BUILD_ADMISSION",
          stateArtifactId: item.browser.stateArtifactId,
        };
      }
      if (item?.browser && item.browser.rowsSeen > 0) {
        return {
          announcementIssue,
          status: "RESUME",
          nextAction: "RESUME_CAPTURE",
          stateArtifactId: item.browser.stateArtifactId,
        };
      }
      return {
        announcementIssue,
        status: "PENDING",
        nextAction: "START_CAPTURE",
      };
    },
  );

  const completed = issues.filter((issue) => issue.status === "COMPLETED").length;
  const resume = issues.filter((issue) => issue.status === "RESUME").length;
  const pending = issues.filter((issue) => issue.status === "PENDING").length;
  const next = issues.find((issue) => issue.status !== "COMPLETED");

  return {
    version: 1,
    operationId: plan.operationId,
    planSha256: cnipaGazetteOrchestrationPlanSha256(plan),
    workspaceId: plan.workspaceId,
    issues,
    counts: {
      total: issues.length,
      completed,
      resume,
      pending,
    },
    nextIssue: next?.announcementIssue ?? null,
    completed: next === undefined,
  };
}

export type CnipaGazetteOrchestrationNextPreparation = {
  progress: CnipaGazetteOrchestrationProgress;
  next: {
    announcementIssue: number;
    status: CnipaGazetteOrchestrationIssueStatus;
    nextAction: CnipaGazetteOrchestrationNextAction;
    browserPlan: CnipaGazetteBrowserAuthorityPlan | null;
  } | null;
};

function browserOperationId(input: {
  plan: CnipaGazetteOrchestrationPlan;
  announcementIssue: number;
  nextAction: CnipaGazetteOrchestrationNextAction;
  stateArtifactId?: string;
}): string {
  if (input.nextAction === "START_CAPTURE") {
    return `${input.plan.operationId}-issue-${input.announcementIssue}-start`;
  }
  if (input.nextAction === "RESUME_CAPTURE") {
    if (!input.stateArtifactId) {
      throw new TypeError(
        "CNIPA Gazette orchestration preparation invalid: resume capture requires state artifact",
      );
    }
    const suffix = createHash("sha256").update(input.stateArtifactId).digest("hex").slice(0, 12);
    return `${input.plan.operationId}-issue-${input.announcementIssue}-resume-${suffix}`;
  }
  throw new TypeError(
    "CNIPA Gazette orchestration preparation invalid: browser plan requested for non-browser action",
  );
}

export function buildCnipaGazetteOrchestrationNextPreparation(input: {
  plan: CnipaGazetteOrchestrationPlan;
  evidence?: readonly CnipaGazetteOrchestrationIssueEvidence[];
}): CnipaGazetteOrchestrationNextPreparation {
  const plan = parseCnipaGazetteOrchestrationPlan(input.plan);
  const evidence = input.evidence ?? [];
  const progress = deriveCnipaGazetteOrchestrationProgress({ plan, evidence });
  if (progress.nextIssue === null) return { progress, next: null };

  const nextProgress = progress.issues.find(
    (issue) => issue.announcementIssue === progress.nextIssue,
  );
  if (!nextProgress) {
    throw new TypeError(
      "CNIPA Gazette orchestration preparation invalid: next issue progress is missing",
    );
  }

  if (nextProgress.nextAction === "BUILD_ADMISSION") {
    return {
      progress,
      next: {
        announcementIssue: nextProgress.announcementIssue,
        status: nextProgress.status,
        nextAction: nextProgress.nextAction,
        browserPlan: null,
      },
    };
  }

  if (nextProgress.nextAction !== "START_CAPTURE" && nextProgress.nextAction !== "RESUME_CAPTURE") {
    throw new TypeError(
      "CNIPA Gazette orchestration preparation invalid: unsupported next browser action",
    );
  }

  const issueEvidence = evidence.find(
    (item) => item.announcementIssue === nextProgress.announcementIssue,
  );
  const resumeFrom =
    nextProgress.nextAction === "RESUME_CAPTURE" ? issueEvidence?.browser?.resumeFrom : undefined;
  if (nextProgress.nextAction === "RESUME_CAPTURE" && !resumeFrom) {
    throw new TypeError(
      "CNIPA Gazette orchestration preparation invalid: resume capture requires frozen resumeFrom refs",
    );
  }

  const browserPlan = cnipaGazetteBrowserAuthorityPlan({
    operationId: browserOperationId({
      plan,
      announcementIssue: nextProgress.announcementIssue,
      nextAction: nextProgress.nextAction,
      ...(nextProgress.stateArtifactId ? { stateArtifactId: nextProgress.stateArtifactId } : {}),
    }),
    workspaceId: plan.workspaceId,
    dispatchMode: "PREPARE_ONLY",
    announcementIssue: nextProgress.announcementIssue,
    targetLogicalPagesPerCheckpoint: plan.browserTemplate.targetLogicalPagesPerCheckpoint,
    maxRuntimeSeconds: plan.browserTemplate.maxRuntimeSeconds,
    captureToolVersion: plan.browserTemplate.captureToolVersion,
    captureToolBundleName: plan.browserTemplate.captureToolBundleName,
    captureToolBundleSha256: plan.browserTemplate.captureToolBundleSha256,
    ...(resumeFrom ? { resumeFrom } : {}),
  });

  return {
    progress,
    next: {
      announcementIssue: nextProgress.announcementIssue,
      status: nextProgress.status,
      nextAction: nextProgress.nextAction,
      browserPlan,
    },
  };
}
