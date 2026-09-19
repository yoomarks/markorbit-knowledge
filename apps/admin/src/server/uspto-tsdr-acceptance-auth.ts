import { createHash, timingSafeEqual } from "node:crypto";
import { CaseProducerAccessError } from "./case-producer-auth";

export const USPTO_TSDR_ACCEPTANCE_AUTHORITY_HEADER = "x-markorbit-tsdr-authority" as const;
export const USPTO_TSDR_ACCEPTANCE_INTERNAL_AUTHORIZATION_HEADER =
  "x-markorbit-internal-authorization" as const;
export const USPTO_TSDR_ACCEPTANCE_AUTHORITY_MODE = "INTERNAL_SERVICE_GO_V1" as const;

const SHA256 = /^[a-f0-9]{64}$/;
const WORKSPACE_ID = /^wsp_[0-9A-HJKMNP-TV-Z]{26}$/;
const SECRET_REF = /^sec_[0-9A-HJKMNP-TV-Z]{26}$/;
const OPERATION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SERIAL_NUMBER = /^[0-9]{8}$/;

type FrozenPlanSummary = {
  workspaceId: string;
  operationId: string;
  stage: "INDEX" | "SELECTED_DOCUMENT";
  planSha256: string;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CaseProducerAccessError(
      "TSDR_ACCEPTANCE_AUTHORITY_INVALID",
      403,
      "TSDR acceptance authority is invalid.",
    );
  }
  return value as Record<string, unknown>;
}
function sameSecret(actual: string | null, expected: string): boolean {
  if (!actual) return false;
  const left = Buffer.from(actual, "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
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

function planHash(plan: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(plan)))
    .digest("hex");
}

function exactKeys(plan: Record<string, unknown>, allowed: readonly string[]): void {
  const permitted = new Set(allowed);
  if (Object.keys(plan).some((key) => !permitted.has(key))) {
    throw new CaseProducerAccessError(
      "TSDR_ACCEPTANCE_AUTHORITY_INVALID",
      403,
      "TSDR acceptance authority is invalid.",
    );
  }
}
function summarizeFrozenPlan(value: unknown, claimedSha256: unknown): FrozenPlanSummary {
  const plan = record(value);
  if (
    plan.version !== 1 ||
    plan.authorityMode !== USPTO_TSDR_ACCEPTANCE_AUTHORITY_MODE ||
    plan.executionMode !== "APPLY_DISPATCH_ONCE" ||
    plan.workerMode !== "PROVISION_ONE_SHOT" ||
    typeof plan.operationId !== "string" ||
    !OPERATION_ID.test(plan.operationId) ||
    typeof plan.workspaceId !== "string" ||
    !WORKSPACE_ID.test(plan.workspaceId) ||
    typeof plan.serialNumber !== "string" ||
    !SERIAL_NUMBER.test(plan.serialNumber) ||
    typeof plan.secretRef !== "string" ||
    !SECRET_REF.test(plan.secretRef)
  ) {
    throw new CaseProducerAccessError(
      "TSDR_ACCEPTANCE_AUTHORITY_INVALID",
      403,
      "TSDR acceptance authority is invalid.",
    );
  }

  if (plan.stage === "INDEX") {
    exactKeys(plan, [
      "version",
      "operationId",
      "workspaceId",
      "authorityMode",
      "executionMode",
      "workerMode",
      "stage",
      "serialNumber",
      "secretRef",
    ]);
  } else if (plan.stage === "SELECTED_DOCUMENT") {
    exactKeys(plan, [
      "version",
      "operationId",
      "workspaceId",
      "authorityMode",
      "executionMode",
      "workerMode",
      "stage",
      "serialNumber",
      "secretRef",
      "format",
      "purpose",
      "businessChain",
      "document",
    ]);
    if (
      plan.format !== "PDF" ||
      !["LIVE_BUSINESS_EVENT", "CASE_RESEARCH"].includes(String(plan.purpose)) ||
      !["OA", "DECLARATION", "RENEWAL", "OTHER_RESEARCH"].includes(String(plan.businessChain)) ||
      !plan.document ||
      typeof plan.document !== "object" ||
      Array.isArray(plan.document)
    ) {
      throw new CaseProducerAccessError(
        "TSDR_ACCEPTANCE_AUTHORITY_INVALID",
        403,
        "TSDR acceptance authority is invalid.",
      );
    }
  } else {
    throw new CaseProducerAccessError(
      "TSDR_ACCEPTANCE_AUTHORITY_INVALID",
      403,
      "TSDR acceptance authority is invalid.",
    );
  }

  if (typeof claimedSha256 !== "string" || !SHA256.test(claimedSha256)) {
    throw new CaseProducerAccessError(
      "TSDR_ACCEPTANCE_AUTHORITY_INVALID",
      403,
      "TSDR acceptance authority is invalid.",
    );
  }
  const computedSha256 = planHash(plan);
  if (computedSha256 !== claimedSha256) {
    throw new CaseProducerAccessError(
      "TSDR_ACCEPTANCE_AUTHORITY_INVALID",
      403,
      "TSDR acceptance authority is invalid.",
    );
  }
  return {
    workspaceId: plan.workspaceId,
    operationId: plan.operationId,
    stage: plan.stage,
    planSha256: computedSha256,
  };
}

export function authenticateUsptoTsdrAcceptanceRequest(
  request: Request,
  input: {
    workspaceId: unknown;
    frozenPlan: unknown;
    planSha256: unknown;
  },
  internalServiceSecret = process.env.MO_INTERNAL_SERVICE_SECRET,
): { actorId: string; planSha256: string } {
  if (!internalServiceSecret) {
    throw new CaseProducerAccessError(
      "TSDR_ACCEPTANCE_AUTH_NOT_CONFIGURED",
      503,
      "TSDR acceptance service authentication is not configured.",
    );
  }
  if (
    !sameSecret(
      request.headers.get(USPTO_TSDR_ACCEPTANCE_INTERNAL_AUTHORIZATION_HEADER),
      internalServiceSecret,
    )
  ) {
    throw new CaseProducerAccessError(
      "INTERNAL_SERVICE_UNAUTHORIZED",
      401,
      "Internal service authentication is required.",
    );
  }

  const summary = summarizeFrozenPlan(input.frozenPlan, input.planSha256);
  if (input.workspaceId !== summary.workspaceId) {
    throw new CaseProducerAccessError(
      "WORKSPACE_MISMATCH",
      403,
      "TSDR acceptance workspace does not match the frozen plan.",
    );
  }
  const expectedToken = `GO #741 TSDR ${summary.operationId} ${summary.stage} ${summary.planSha256}`;
  const suppliedToken = request.headers.get(USPTO_TSDR_ACCEPTANCE_AUTHORITY_HEADER);
  if (!sameSecret(suppliedToken, expectedToken)) {
    throw new CaseProducerAccessError(
      "TSDR_ACCEPTANCE_AUTHORITY_INVALID",
      403,
      "TSDR acceptance authority does not match the frozen plan.",
    );
  }

  const authorityDigest = createHash("sha256").update(expectedToken).digest("hex");

  return {
    actorId: `tsdr-acceptance:${authorityDigest.slice(0, 32)}`,
    planSha256: summary.planSha256,
  };
}
