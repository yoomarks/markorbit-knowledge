import type { SourceCoverageTarget } from "@markorbit/contracts";
import { listSourceCoverageTargets } from "@markorbit/persistence/source-coverage";
import { auditSourceCoverageVerification } from "@markorbit/persistence/source-coverage-verification-audit";

export const SOURCE_CATALOG_VERIFICATION_MAX_AGE_DAYS = 30;
export const SOURCE_CATALOG_VERIFICATION_QUEUE_LIMIT = 12;

export type SourceCatalogVerificationDebtItem = {
  targetId: string;
  jurisdiction: string;
  displayName: string;
  family: string;
  coverageTier: string;
  catalogState: string;
  verifiedAt: string;
  verificationEvidenceUri: string;
  ageDays: number | null;
  state: "STALE" | "INVALID";
};

export type SourceCatalogVerificationHealth = {
  observedAt: string;
  maxAgeDays: number;
  total: number;
  fresh: number;
  stale: number;
  invalid: number;
  freshnessPercent: number;
  oldestVerifiedAt: string | null;
  latestVerifiedAt: string | null;
  staleJurisdictionCount: number;
  invalidJurisdictionCount: number;
  duplicateTargetCount: number;
  missingEvidenceTargetCount: number;
  debtQueue: SourceCatalogVerificationDebtItem[];
};

function percent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1_000) / 10;
}

function verificationAgeDays(verifiedAt: string, observedAtMs: number): number | null {
  const verifiedAtMs = Date.parse(verifiedAt);
  if (!Number.isFinite(verifiedAtMs) || verifiedAtMs > observedAtMs) return null;
  return Math.floor((observedAtMs - verifiedAtMs) / (24 * 60 * 60 * 1_000));
}

/**
 * Builds an operational view over version-controlled catalog verification metadata.
 * This is catalog-maintenance health only. It must not be interpreted as live Source,
 * acquisition, compatibility or downstream supply health.
 */
export function buildSourceCatalogVerificationHealth(
  targets: readonly SourceCoverageTarget[],
  options: {
    observedAt: Date;
    maxAgeDays?: number;
    queueLimit?: number;
  },
): SourceCatalogVerificationHealth {
  const maxAgeDays = options.maxAgeDays ?? SOURCE_CATALOG_VERIFICATION_MAX_AGE_DAYS;
  const queueLimit = options.queueLimit ?? SOURCE_CATALOG_VERIFICATION_QUEUE_LIMIT;
  if (!Number.isInteger(queueLimit) || queueLimit < 0 || queueLimit > 100) {
    throw new Error("queueLimit must be an integer from 0 to 100");
  }

  const audit = auditSourceCoverageVerification(targets, {
    observedAt: options.observedAt,
    maxAgeDays,
  });
  const staleIds = new Set(audit.staleTargetIds);
  const invalidIds = new Set(audit.invalidTargetIds);
  const observedAtMs = options.observedAt.getTime();

  const debt = targets
    .filter((target) => staleIds.has(target.id) || invalidIds.has(target.id))
    .map((target): SourceCatalogVerificationDebtItem => ({
      targetId: target.id,
      jurisdiction: target.jurisdiction,
      displayName: target.displayName,
      family: target.family,
      coverageTier: target.coverageTier,
      catalogState: target.catalogState,
      verifiedAt: target.verifiedAt,
      verificationEvidenceUri: target.verificationEvidenceUri,
      ageDays: verificationAgeDays(target.verifiedAt, observedAtMs),
      state: invalidIds.has(target.id) ? "INVALID" : "STALE",
    }))
    .sort((left, right) => {
      if (left.state !== right.state) return left.state === "INVALID" ? -1 : 1;
      if (left.ageDays === null && right.ageDays !== null) return -1;
      if (left.ageDays !== null && right.ageDays === null) return 1;
      if (left.ageDays !== right.ageDays) return (right.ageDays ?? 0) - (left.ageDays ?? 0);
      return left.targetId.localeCompare(right.targetId);
    });

  return {
    observedAt: audit.observedAt,
    maxAgeDays,
    total: audit.total,
    fresh: audit.fresh,
    stale: audit.stale,
    invalid: audit.invalid,
    freshnessPercent: percent(audit.fresh, audit.total),
    oldestVerifiedAt: audit.oldestVerifiedAt,
    latestVerifiedAt: audit.latestVerifiedAt,
    staleJurisdictionCount: new Set(
      debt.filter((item) => item.state === "STALE").map((item) => item.jurisdiction),
    ).size,
    invalidJurisdictionCount: new Set(
      debt.filter((item) => item.state === "INVALID").map((item) => item.jurisdiction),
    ).size,
    duplicateTargetCount: audit.duplicateTargetIds.length,
    missingEvidenceTargetCount: audit.missingEvidenceTargetIds.length,
    debtQueue: debt.slice(0, queueLimit),
  };
}

export function readSourceCatalogVerificationHealth(
  observedAt = new Date(),
): SourceCatalogVerificationHealth {
  return buildSourceCatalogVerificationHealth(listSourceCoverageTargets(), { observedAt });
}
