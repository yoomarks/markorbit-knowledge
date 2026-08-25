import type { CaseCandidateV1 } from "@markorbit/contracts";
import {
  CaseEvidenceCollectionError,
  type AuthorizedMarkRegCaseSourceResolver,
  type ResolvedMarkRegCaseSourceAccess,
} from "./markreg-case-evidence-collector";

const MAX_BASE_URL_LENGTH = 2_048;
const MAX_WORKSPACE_ID_LENGTH = 512;
const MAX_INTERNAL_SECRET_LENGTH = 4_096;
const MAX_INTERNAL_PRINCIPAL_LENGTH = 32_768;

export const MARKREG_CASE_SOURCE_ENV = Object.freeze({
  baseUrl: "MARKORBIT_MARKREG_BASE_URL",
  workspaceId: "MARKORBIT_MARKREG_WORKSPACE_ID",
  internalServiceSecret: "MARKORBIT_MARKREG_INTERNAL_SERVICE_SECRET",
  internalWorkspacePrincipal: "MARKORBIT_MARKREG_INTERNAL_WORKSPACE_PRINCIPAL",
} as const);

export type ConfiguredMarkRegCaseSourceResolverOptions = {
  baseUrl: string;
  workspaceId: string;
  internalServiceSecret: string;
  internalWorkspacePrincipal: string;
};

export type MarkRegCaseSourceEnvironment = Readonly<Record<string, string | undefined>>;

function configuredValue(value: string, field: string, maxLength: number): string {
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maxLength) {
    throw new CaseEvidenceCollectionError(
      "MARKREG_SOURCE_ACCESS_INVALID",
      `${field} must contain 1 to ${maxLength} characters`,
      false,
    );
  }
  return cleaned;
}

function configuredBaseUrl(value: string): string {
  const cleaned = configuredValue(value, "MarkReg base URL", MAX_BASE_URL_LENGTH);
  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    throw new CaseEvidenceCollectionError(
      "MARKREG_SOURCE_ACCESS_INVALID",
      "MarkReg base URL is invalid",
      false,
    );
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new CaseEvidenceCollectionError(
      "MARKREG_SOURCE_ACCESS_INVALID",
      "MarkReg base URL must be an HTTP(S) service URL without credentials, query, or fragment",
      false,
    );
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/u, "");
  return parsed.toString().replace(/\/$/u, "");
}

function requiredEnvironmentValue(
  environment: MarkRegCaseSourceEnvironment,
  name: string,
): string {
  const value = environment[name];
  if (value === undefined) {
    throw new CaseEvidenceCollectionError(
      "MARKREG_SOURCE_ACCESS_INVALID",
      `Required MarkReg runtime configuration ${name} is missing`,
      false,
    );
  }
  return value;
}

export class ConfiguredMarkRegCaseSourceResolver implements AuthorizedMarkRegCaseSourceResolver {
  private readonly access: ResolvedMarkRegCaseSourceAccess;

  constructor(options: ConfiguredMarkRegCaseSourceResolverOptions) {
    this.access = Object.freeze({
      baseUrl: configuredBaseUrl(options.baseUrl),
      workspaceId: configuredValue(
        options.workspaceId,
        "MarkReg Workspace ID",
        MAX_WORKSPACE_ID_LENGTH,
      ),
      internalAuthorization: configuredValue(
        options.internalServiceSecret,
        "MarkReg internal service secret",
        MAX_INTERNAL_SECRET_LENGTH,
      ),
      internalPrincipal: configuredValue(
        options.internalWorkspacePrincipal,
        "MarkReg internal Workspace Principal",
        MAX_INTERNAL_PRINCIPAL_LENGTH,
      ),
    });
  }

  resolve(candidate: Readonly<CaseCandidateV1>): Promise<ResolvedMarkRegCaseSourceAccess> {
    if (candidate.sourceSystem !== "MARKREG") {
      return Promise.reject(
        new CaseEvidenceCollectionError(
          "MARKREG_SOURCE_SYSTEM_UNSUPPORTED",
          "Configured MarkReg source access can resolve only MARKREG Case Candidates",
          false,
        ),
      );
    }
    if (candidate.accessScope.sourceWorkspaceId !== this.access.workspaceId) {
      return Promise.reject(
        new CaseEvidenceCollectionError(
          "MARKREG_WORKSPACE_MISMATCH",
          "Configured MarkReg Workspace does not match the Case Candidate",
          false,
        ),
      );
    }
    return Promise.resolve({ ...this.access });
  }
}

export function markRegCaseSourceResolverFromEnvironment(
  environment: MarkRegCaseSourceEnvironment = process.env,
): ConfiguredMarkRegCaseSourceResolver {
  return new ConfiguredMarkRegCaseSourceResolver({
    baseUrl: requiredEnvironmentValue(environment, MARKREG_CASE_SOURCE_ENV.baseUrl),
    workspaceId: requiredEnvironmentValue(environment, MARKREG_CASE_SOURCE_ENV.workspaceId),
    internalServiceSecret: requiredEnvironmentValue(
      environment,
      MARKREG_CASE_SOURCE_ENV.internalServiceSecret,
    ),
    internalWorkspacePrincipal: requiredEnvironmentValue(
      environment,
      MARKREG_CASE_SOURCE_ENV.internalWorkspacePrincipal,
    ),
  });
}
