import type { CaseCandidateV1 } from "@markorbit/contracts";
import {
  CaseEvidenceCollectionError,
  type AuthorizedMarkRegCaseSourceResolver,
} from "@markorbit/worker-runtime/markreg-case-evidence-collector";
import {
  authorizeCaseProducerRequest,
  CASE_PRODUCER_PRINCIPAL_HEADER,
} from "./case-producer-auth";

export type RequestBoundMarkRegCaseSourceResolverOptions = {
  baseUrl?: string | null;
  internalServiceSecret?: string | null;
};

function configuredBaseUrl(raw: string | null | undefined): string {
  const value = raw?.trim();
  if (!value) {
    throw new CaseEvidenceCollectionError(
      "MARKREG_SOURCE_ACCESS_INVALID",
      "MARKREG_URL is not configured for Case evidence collection",
      false,
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CaseEvidenceCollectionError(
      "MARKREG_SOURCE_ACCESS_INVALID",
      "MARKREG_URL must be a complete HTTP(S) service URL",
      false,
    );
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new CaseEvidenceCollectionError(
      "MARKREG_SOURCE_ACCESS_INVALID",
      "MARKREG_URL must be an HTTP(S) service URL without credentials, query, or fragment",
      false,
    );
  }

  url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
  return url.toString().replace(/\/$/u, "");
}

/**
 * Resolve MarkReg evidence access only for the lifetime of one authenticated
 * internal request. The Workspace Principal is forwarded to MarkReg but is
 * never written into the Candidate or evidence repositories.
 */
export function createRequestBoundMarkRegCaseSourceResolver(
  request: Request,
  options: RequestBoundMarkRegCaseSourceResolverOptions = {},
): AuthorizedMarkRegCaseSourceResolver {
  return {
    async resolve(candidate: Readonly<CaseCandidateV1>) {
      const secret = options.internalServiceSecret ?? process.env.MO_INTERNAL_SERVICE_SECRET;
      const principal = authorizeCaseProducerRequest(request, candidate, secret ?? undefined);
      const encodedPrincipal = request.headers.get(CASE_PRODUCER_PRINCIPAL_HEADER);
      if (!secret || !encodedPrincipal) {
        throw new CaseEvidenceCollectionError(
          "MARKREG_SOURCE_ACCESS_INVALID",
          "Authenticated MarkReg source credentials are incomplete",
          false,
        );
      }

      return {
        baseUrl: configuredBaseUrl(options.baseUrl ?? process.env.MARKREG_URL),
        workspaceId: principal.workspaceId,
        internalAuthorization: secret,
        internalPrincipal: encodedPrincipal,
      };
    },
  };
}
