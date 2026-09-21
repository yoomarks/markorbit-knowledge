import { createHash, timingSafeEqual } from "node:crypto";
import {
  cnipaGazetteBrowserAdmissionPlanSha256,
  expectedCnipaGazetteBrowserAdmissionAuthorityToken,
  parseCnipaGazetteBrowserAdmissionPlan,
} from "@markorbit/worker-runtime";
import { CaseProducerAccessError } from "./case-producer-auth";

export const CNIPA_GAZETTE_BROWSER_ADMISSION_AUTHORITY_HEADER =
  "x-markorbit-cnipa-gazette-browser-admission-authority" as const;
export const CNIPA_GAZETTE_BROWSER_ADMISSION_INTERNAL_AUTHORIZATION_HEADER =
  "x-markorbit-internal-authorization" as const;

function sameSecret(actual: string | null, expected: string): boolean {
  if (!actual) return false;
  const left = Buffer.from(actual, "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function authenticateCnipaGazetteBrowserAdmissionRequest(
  request: Request,
  input: { workspaceId: unknown; frozenPlan: unknown; planSha256: unknown },
  internalServiceSecret = process.env.MO_INTERNAL_SERVICE_SECRET,
): { actorId: string; planSha256: string } {
  if (!internalServiceSecret) {
    throw new CaseProducerAccessError(
      "CNIPA_GAZETTE_BROWSER_ADMISSION_AUTH_NOT_CONFIGURED",
      503,
      "CNIPA Gazette browser admission service authentication is not configured.",
    );
  }
  if (
    !sameSecret(
      request.headers.get(CNIPA_GAZETTE_BROWSER_ADMISSION_INTERNAL_AUTHORIZATION_HEADER),
      internalServiceSecret,
    )
  ) {
    throw new CaseProducerAccessError(
      "INTERNAL_SERVICE_UNAUTHORIZED",
      401,
      "Internal service authentication is required.",
    );
  }

  let plan;
  try {
    plan = parseCnipaGazetteBrowserAdmissionPlan(input.frozenPlan);
  } catch {
    throw new CaseProducerAccessError(
      "CNIPA_GAZETTE_BROWSER_ADMISSION_AUTHORITY_INVALID",
      403,
      "CNIPA Gazette browser admission authority is invalid.",
    );
  }
  const computedSha256 = cnipaGazetteBrowserAdmissionPlanSha256(plan);
  if (
    typeof input.planSha256 !== "string" ||
    input.planSha256 !== computedSha256 ||
    input.workspaceId !== plan.workspaceId
  ) {
    throw new CaseProducerAccessError(
      "CNIPA_GAZETTE_BROWSER_ADMISSION_AUTHORITY_INVALID",
      403,
      "CNIPA Gazette browser admission authority is invalid.",
    );
  }
  const expectedToken = expectedCnipaGazetteBrowserAdmissionAuthorityToken(plan, computedSha256);
  if (
    !sameSecret(
      request.headers.get(CNIPA_GAZETTE_BROWSER_ADMISSION_AUTHORITY_HEADER),
      expectedToken,
    )
  ) {
    throw new CaseProducerAccessError(
      "CNIPA_GAZETTE_BROWSER_ADMISSION_AUTHORITY_INVALID",
      403,
      "CNIPA Gazette browser admission authority does not match the frozen plan.",
    );
  }
  const digest = createHash("sha256").update(expectedToken).digest("hex");
  return {
    actorId: `cnipa-gazette-browser-admission:${digest.slice(0, 32)}`,
    planSha256: computedSha256,
  };
}
