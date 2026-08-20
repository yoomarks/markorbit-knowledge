import { RegistryValidationError } from "./index";
import {
  validateProductionValidationManifest,
  type ProductionValidationManifest,
  type ProductionValidationManifestTarget,
} from "./production-validation-discovery-intake";
import { getSourceCoverageTarget } from "./source-coverage-catalog";

export type ProductionValidationCoverageLinkedTarget = ProductionValidationManifestTarget & {
  coverageTargetIds: string[];
};

export type ProductionValidationCoverageLinkedManifest = Omit<
  ProductionValidationManifest,
  "targets"
> & {
  targets: ProductionValidationCoverageLinkedTarget[];
};

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RegistryValidationError(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function coverageTargetIds(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new RegistryValidationError(`${field} must be an array`);
  }
  const ids = value.map((item, index) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new RegistryValidationError(`${field}[${index}] must be a non-empty string`);
    }
    return item.trim();
  });
  if (new Set(ids).size !== ids.length) {
    throw new RegistryValidationError(`${field} must not contain duplicates`);
  }
  return ids;
}

export function validateProductionValidationCoverageLinkedManifest(
  value: unknown,
): ProductionValidationCoverageLinkedManifest {
  const base = validateProductionValidationManifest(value);
  const input = record(value, "Production validation manifest");
  if (!Array.isArray(input.targets)) {
    throw new RegistryValidationError("Production validation targets are required");
  }

  const targets = base.targets.map((target, index): ProductionValidationCoverageLinkedTarget => {
    const raw = record(input.targets?.[index], `targets[${index}]`);
    const ids = coverageTargetIds(raw.coverageTargetIds, `${target.id}.coverageTargetIds`);
    for (const coverageTargetId of ids) {
      const coverage = getSourceCoverageTarget(coverageTargetId);
      if (!coverage) {
        throw new RegistryValidationError(
          `${target.id}.coverageTargetIds references unknown target ${coverageTargetId}`,
        );
      }
      if (coverage.catalogState !== "ACTIVE" || coverage.coverageTier !== "FOUNDATIONAL") {
        throw new RegistryValidationError(
          `${target.id}.coverageTargetIds requires ACTIVE FOUNDATIONAL target ${coverageTargetId}`,
        );
      }
      if (coverage.jurisdiction !== target.jurisdiction.trim().toUpperCase()) {
        throw new RegistryValidationError(
          `${target.id}.coverageTargetIds target ${coverageTargetId} belongs to ${coverage.jurisdiction}`,
        );
      }
    }
    return { ...target, coverageTargetIds: ids };
  });

  return { ...base, targets };
}
