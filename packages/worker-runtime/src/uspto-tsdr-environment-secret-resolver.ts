import type { UsptoTsdrSecretResolver } from "./uspto-tsdr-document-index-acquirer";

export const USPTO_TSDR_SECRET_ENV_PREFIX = "MARKORBIT_SECRET_BINDING_" as const;

const SECRET_REFERENCE = /^sec_[0-9A-HJKMNP-TV-Z]{26}$/;

export type UsptoTsdrSecretResolutionErrorCode =
  "TSDR_SECRET_REFERENCE_INVALID" | "TSDR_SECRET_BINDING_MISSING";

export class UsptoTsdrSecretResolutionError extends Error {
  readonly code: UsptoTsdrSecretResolutionErrorCode;

  constructor(code: UsptoTsdrSecretResolutionErrorCode, message: string) {
    super(message);
    this.name = "UsptoTsdrSecretResolutionError";
    this.code = code;
  }
}

export function usptoTsdrSecretEnvironmentName(secretRef: string): string {
  if (!SECRET_REFERENCE.test(secretRef)) {
    throw new UsptoTsdrSecretResolutionError(
      "TSDR_SECRET_REFERENCE_INVALID",
      "TSDR runtime secret resolution requires a Schema v1 secretRef",
    );
  }
  return `${USPTO_TSDR_SECRET_ENV_PREFIX}${secretRef.toUpperCase()}`;
}

/**
 * Resolves a governed Schema v1 secretRef from process-start secret injection.
 *
 * The environment variable name is deterministic from the public secretRef.
 * The secret value itself must be injected by the deployment/runtime secret
 * facility. This resolver never accepts a raw key as an identifier, persists
 * values, or includes values in errors.
 */
export class UsptoTsdrEnvironmentSecretResolver implements UsptoTsdrSecretResolver {
  constructor(private readonly environment: NodeJS.ProcessEnv = process.env) {}

  async resolve(secretRef: string): Promise<string> {
    const variableName = usptoTsdrSecretEnvironmentName(secretRef);
    const value = this.environment[variableName]?.trim();
    if (!value) {
      throw new UsptoTsdrSecretResolutionError(
        "TSDR_SECRET_BINDING_MISSING",
        `No runtime secret binding is available for ${secretRef}`,
      );
    }
    return value;
  }
}
