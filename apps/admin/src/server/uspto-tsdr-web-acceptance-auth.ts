import { createHash, timingSafeEqual } from "node:crypto";
import {
  normalizeUsptoTsdrWebSelectedDocumentSelection,
  type UsptoTsdrWebSelectedDocumentSelection,
} from "@markorbit/worker-runtime";
import { CaseProducerAccessError } from "./case-producer-auth";

export const USPTO_TSDR_WEB_ACCEPTANCE_AUTHORITY_HEADER = "x-markorbit-tsdr-web-authority" as const;
export const USPTO_TSDR_WEB_ACCEPTANCE_INTERNAL_AUTHORIZATION_HEADER =
  "x-markorbit-internal-authorization" as const;

const SHA256 = /^[a-f0-9]{64}$/u;
const WORKSPACE_ID = /^wsp_[0-9A-HJKMNP-TV-Z]{26}$/u;
const OPERATION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SERIAL_NUMBER = /^[0-9]{8}$/u;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CaseProducerAccessError(
      "TSDR_WEB_ACCEPTANCE_AUTHORITY_INVALID",
      403,
      "TSDR Web acceptance authority is invalid.",
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

function invalid(): never {
  throw new CaseProducerAccessError(
    "TSDR_WEB_ACCEPTANCE_AUTHORITY_INVALID",
    403,
    "TSDR Web acceptance authority is invalid.",
  );
}

function summarizeFrozenPlan(
  value: unknown,
  claimedSha256: unknown,
): {
  workspaceId: string;
  operationId: string;
  stage: string;
  transportMode: string;
  robotsPolicy: string;
  serialNumber: string;
  planSha256: string;
  document?: UsptoTsdrWebSelectedDocumentSelection;
} {
  const plan = record(value);
  const stage = typeof plan.stage === "string" ? plan.stage : "";
  const selected = stage === "SELECTED_DOCUMENT";
  const allowed = new Set([
    "version",
    "operationId",
    "workspaceId",
    "authorityMode",
    "executionMode",
    "workerMode",
    "channel",
    "stage",
    "transportMode",
    "robotsPolicy",
    "serialNumber",
    ...(selected ? ["format", "purpose", "businessChain", "document"] : []),
  ]);
  if (
    Object.keys(plan).some((key) => !allowed.has(key)) ||
    plan.version !== 1 ||
    plan.authorityMode !== "INTERNAL_SERVICE_GO_V1" ||
    plan.executionMode !== "APPLY_DISPATCH_ONCE" ||
    plan.workerMode !== "PROVISION_ONE_SHOT" ||
    plan.channel !== "WEB" ||
    typeof plan.operationId !== "string" ||
    !OPERATION_ID.test(plan.operationId) ||
    typeof plan.workspaceId !== "string" ||
    !WORKSPACE_ID.test(plan.workspaceId) ||
    typeof plan.serialNumber !== "string" ||
    !SERIAL_NUMBER.test(plan.serialNumber) ||
    !["STATUS", "MARK_IMAGE", "DOCUMENT_INDEX", "SELECTED_DOCUMENT"].includes(stage) ||
    plan.transportMode !== "STATIC_HTTP_PINNED" ||
    plan.robotsPolicy !== "RFC9309_4XX_UNAVAILABLE_ALLOW_5XX_UNREACHABLE_FAIL_V1"
  ) {
    invalid();
  }
  let document: UsptoTsdrWebSelectedDocumentSelection | undefined;
  if (selected) {
    if (plan.format !== "PDF" || plan.purpose !== "CASE_RESEARCH" || plan.businessChain !== "OA") {
      invalid();
    }
    try {
      document = normalizeUsptoTsdrWebSelectedDocumentSelection(
        plan.serialNumber as string,
        plan.document,
      );
    } catch {
      invalid();
    }
  }
  if (typeof claimedSha256 !== "string" || !SHA256.test(claimedSha256)) invalid();
  const computedSha256 = planHash(plan);
  if (computedSha256 !== claimedSha256) invalid();
  return {
    workspaceId: plan.workspaceId as string,
    operationId: plan.operationId as string,
    stage,
    transportMode: "STATIC_HTTP_PINNED",
    robotsPolicy: "RFC9309_4XX_UNAVAILABLE_ALLOW_5XX_UNREACHABLE_FAIL_V1",
    serialNumber: plan.serialNumber as string,
    planSha256: computedSha256,
    ...(document ? { document } : {}),
  };
}

export function authenticateUsptoTsdrWebAcceptanceRequest(
  request: Request,
  input: { workspaceId: unknown; frozenPlan: unknown; planSha256: unknown },
  internalServiceSecret = process.env.MO_INTERNAL_SERVICE_SECRET,
): {
  actorId: string;
  planSha256: string;
  stage: string;
  transportMode: string;
  robotsPolicy: string;
  serialNumber: string;
  document?: UsptoTsdrWebSelectedDocumentSelection;
} {
  if (!internalServiceSecret) {
    throw new CaseProducerAccessError(
      "TSDR_WEB_ACCEPTANCE_AUTH_NOT_CONFIGURED",
      503,
      "TSDR Web acceptance service authentication is not configured.",
    );
  }
  if (
    !sameSecret(
      request.headers.get(USPTO_TSDR_WEB_ACCEPTANCE_INTERNAL_AUTHORIZATION_HEADER),
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
      "TSDR Web acceptance workspace does not match the frozen plan.",
    );
  }
  const expectedToken = `GO #842 TSDR-WEB ${summary.operationId} ${summary.stage} ${summary.planSha256}`;
  const suppliedToken = request.headers.get(USPTO_TSDR_WEB_ACCEPTANCE_AUTHORITY_HEADER);
  if (!sameSecret(suppliedToken, expectedToken)) {
    throw new CaseProducerAccessError(
      "TSDR_WEB_ACCEPTANCE_AUTHORITY_INVALID",
      403,
      "TSDR Web acceptance authority does not match the frozen plan.",
    );
  }
  const digest = createHash("sha256").update(expectedToken).digest("hex");
  return {
    actorId: `tsdr-web-acceptance:${digest.slice(0, 32)}`,
    planSha256: summary.planSha256,
    stage: summary.stage,
    transportMode: summary.transportMode,
    robotsPolicy: summary.robotsPolicy,
    serialNumber: summary.serialNumber,
    ...(summary.document ? { document: summary.document } : {}),
  };
}
