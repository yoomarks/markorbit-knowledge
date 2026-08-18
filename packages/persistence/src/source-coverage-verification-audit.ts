import type { SourceCoverageTarget } from "@markorbit/contracts";

const DAY_MS = 24 * 60 * 60 * 1_000;

export type SourceCoverageVerificationJurisdictionAudit = {
  total: number;
  fresh: number;
  stale: number;
  invalid: number;
};

export type SourceCoverageVerificationAudit = {
  observedAt: string;
  maxAgeDays: number;
  total: number;
  fresh: number;
  stale: number;
  invalid: number;
  oldestVerifiedAt: string | null;
  latestVerifiedAt: string | null;
  staleTargetIds: string[];
  invalidTargetIds: string[];
  duplicateTargetIds: string[];
  missingEvidenceTargetIds: string[];
  byJurisdiction: Record<string, SourceCoverageVerificationJurisdictionAudit>;
};

function assertObservedAt(value: Date): number {
  const time = value.getTime();
  if (!Number.isFinite(time)) throw new Error("observedAt must be a valid Date");
  return time;
}

function assertMaxAgeDays(value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("maxAgeDays must be a non-negative integer");
  }
}

function increment(
  byJurisdiction: Record<string, SourceCoverageVerificationJurisdictionAudit>,
  jurisdiction: string,
  state: "fresh" | "stale" | "invalid",
): void {
  const bucket = (byJurisdiction[jurisdiction] ??= {
    total: 0,
    fresh: 0,
    stale: 0,
    invalid: 0,
  });
  bucket.total += 1;
  bucket[state] += 1;
}

/**
 * Audits catalog verification metadata without mutating catalog state or implying that
 * a stale target is unhealthy at runtime. Freshness here means only that the target's
 * catalog evidence was verified within the requested audit window.
 */
export function auditSourceCoverageVerification(
  targets: readonly SourceCoverageTarget[],
  options: { observedAt: Date; maxAgeDays: number },
): SourceCoverageVerificationAudit {
  const observedAtMs = assertObservedAt(options.observedAt);
  assertMaxAgeDays(options.maxAgeDays);
  const maximumAgeMs = options.maxAgeDays * DAY_MS;

  const audit: SourceCoverageVerificationAudit = {
    observedAt: options.observedAt.toISOString(),
    maxAgeDays: options.maxAgeDays,
    total: targets.length,
    fresh: 0,
    stale: 0,
    invalid: 0,
    oldestVerifiedAt: null,
    latestVerifiedAt: null,
    staleTargetIds: [],
    invalidTargetIds: [],
    duplicateTargetIds: [],
    missingEvidenceTargetIds: [],
    byJurisdiction: {},
  };

  const ids = new Set<string>();
  let oldest: { time: number; value: string } | null = null;
  let latest: { time: number; value: string } | null = null;

  for (const target of targets) {
    if (ids.has(target.id)) audit.duplicateTargetIds.push(target.id);
    else ids.add(target.id);

    if (!target.verificationEvidenceUri.trim()) {
      audit.missingEvidenceTargetIds.push(target.id);
    }

    const verifiedAtMs = Date.parse(target.verifiedAt);
    if (!Number.isFinite(verifiedAtMs) || verifiedAtMs > observedAtMs) {
      audit.invalid += 1;
      audit.invalidTargetIds.push(target.id);
      increment(audit.byJurisdiction, target.jurisdiction, "invalid");
      continue;
    }

    if (!oldest || verifiedAtMs < oldest.time)
      oldest = { time: verifiedAtMs, value: target.verifiedAt };
    if (!latest || verifiedAtMs > latest.time)
      latest = { time: verifiedAtMs, value: target.verifiedAt };

    if (observedAtMs - verifiedAtMs <= maximumAgeMs) {
      audit.fresh += 1;
      increment(audit.byJurisdiction, target.jurisdiction, "fresh");
    } else {
      audit.stale += 1;
      audit.staleTargetIds.push(target.id);
      increment(audit.byJurisdiction, target.jurisdiction, "stale");
    }
  }

  audit.oldestVerifiedAt = oldest?.value ?? null;
  audit.latestVerifiedAt = latest?.value ?? null;
  audit.staleTargetIds.sort();
  audit.invalidTargetIds.sort();
  audit.duplicateTargetIds.sort();
  audit.missingEvidenceTargetIds.sort();

  return audit;
}
