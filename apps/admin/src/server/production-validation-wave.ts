import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RegistryValidationError } from "@markorbit/persistence";
import type { ProductionValidationManifest } from "@markorbit/persistence/production-validation-discovery-intake";

const DEFAULT_MANIFEST_PATH = "config/production-validation-wave-1.json";

function repositoryRoot(): string {
  return process.env.MARKORBIT_REPOSITORY_ROOT ?? process.env.INIT_CWD ?? process.cwd();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseProductionValidationManifest(value: unknown): ProductionValidationManifest {
  if (!isRecord(value)) {
    throw new RegistryValidationError("Production validation manifest must be an object");
  }
  const governance = value.governance;
  const targets = value.targets;
  if (!isRecord(governance) || !Array.isArray(targets)) {
    throw new RegistryValidationError(
      "Production validation manifest requires governance and targets",
    );
  }
  return value as unknown as ProductionValidationManifest;
}

export function loadProductionValidationWave(
  path = process.env.MARKORBIT_PRODUCTION_VALIDATION_MANIFEST_PATH ?? DEFAULT_MANIFEST_PATH,
): ProductionValidationManifest {
  const absolutePath = resolve(repositoryRoot(), path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(absolutePath, "utf8")) as unknown;
  } catch (error) {
    throw new RegistryValidationError(
      `Unable to load production validation manifest at ${absolutePath}: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
  return parseProductionValidationManifest(parsed);
}
