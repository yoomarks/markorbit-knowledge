import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_WORKSPACE, RegistryValidationError } from "@markorbit/persistence";
import {
  validateProductionValidationCoverageLinkedManifest,
  type ProductionValidationCoverageLinkedManifest,
} from "@markorbit/persistence/production-validation-coverage-links";

const DEFAULT_MANIFEST_PATH = "config/production-validation-wave-1.json";

function repositoryRoot(): string {
  return process.env.MARKORBIT_REPOSITORY_ROOT ?? process.env.INIT_CWD ?? process.cwd();
}

export function resolveProductionValidationWorkspaceId(value: unknown): string {
  if (value === null || value === undefined || value === "") return DEFAULT_WORKSPACE.id;
  if (typeof value !== "string" || !value.trim()) {
    throw new RegistryValidationError("workspaceId must be a non-empty string");
  }
  const workspaceId = value.trim();
  if (workspaceId !== DEFAULT_WORKSPACE.id) {
    throw new RegistryValidationError(
      `Production validation currently supports only workspace ${DEFAULT_WORKSPACE.id}`,
    );
  }
  return workspaceId;
}

export function parseProductionValidationManifest(
  value: unknown,
): ProductionValidationCoverageLinkedManifest {
  return validateProductionValidationCoverageLinkedManifest(value);
}

export function loadProductionValidationWave(
  path = process.env.MARKORBIT_PRODUCTION_VALIDATION_MANIFEST_PATH ?? DEFAULT_MANIFEST_PATH,
): ProductionValidationCoverageLinkedManifest {
  const absolutePath = resolve(/* turbopackIgnore: true */ repositoryRoot(), path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      readFileSync(/* turbopackIgnore: true */ absolutePath, "utf8"),
    ) as unknown;
  } catch (error) {
    throw new RegistryValidationError(
      `Unable to load production validation manifest at ${absolutePath}: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
  return parseProductionValidationManifest(parsed);
}
