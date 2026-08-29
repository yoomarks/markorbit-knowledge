import { describe, expect, it } from "vitest";
import { PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS } from "./priority-national-source-coverage";
import {
  PRIORITY_NATIONAL_DEFAULT_VERIFIED_AT,
  buildPriorityNationalSourceCoverageTarget,
  type PriorityNationalCoverageAuthority,
} from "./priority-national-source-coverage-builder";
import { auditSourceCoverageVerification } from "./source-coverage-verification-audit";

const AUTHORITY: PriorityNationalCoverageAuthority = {
  jurisdiction: "ZZ",
  authorityName: "Fixture Intellectual Property Office",
  languages: ["en"],
  verificationEvidenceUri: "https://example.test/trademarks",
};

function fixture(id: string, verifiedAt?: string) {
  return buildPriorityNationalSourceCoverageTarget(AUTHORITY, {
    id,
    family: "PORTAL",
    displayName: id,
    canonicalUri: `https://example.test/${id}`,
    ...(verifiedAt ? { verifiedAt } : {}),
  });
}

describe("priority national source coverage verification", () => {
  it("keeps the existing catalog default while allowing one target to carry independent evidence time", () => {
    const defaultTarget = fixture("default-target");
    const independentlyVerified = fixture("independent-target", "2026-08-18T04:30:00Z");

    expect(defaultTarget.verifiedAt).toBe(PRIORITY_NATIONAL_DEFAULT_VERIFIED_AT);
    expect(independentlyVerified.verifiedAt).toBe("2026-08-18T04:30:00Z");
    expect(defaultTarget.canonicalUri).toBe("https://example.test/default-target");
    expect(defaultTarget.entrypoints).toEqual([{ uri: defaultTarget.canonicalUri }]);
  });

  it("classifies the exact max-age boundary as fresh and older evidence as stale", () => {
    const audit = auditSourceCoverageVerification(
      [
        fixture("boundary", "2026-07-19T12:00:00.000Z"),
        fixture("stale", "2026-07-19T11:59:59.999Z"),
      ],
      {
        observedAt: new Date("2026-08-18T12:00:00.000Z"),
        maxAgeDays: 30,
      },
    );

    expect(audit).toMatchObject({
      total: 2,
      fresh: 1,
      stale: 1,
      invalid: 0,
      staleTargetIds: ["stale"],
      oldestVerifiedAt: "2026-07-19T11:59:59.999Z",
      latestVerifiedAt: "2026-07-19T12:00:00.000Z",
    });
    expect(audit.byJurisdiction.ZZ).toEqual({ total: 2, fresh: 1, stale: 1, invalid: 0 });
  });

  it("reports malformed and future verification times as invalid instead of silently fresh", () => {
    const audit = auditSourceCoverageVerification(
      [fixture("malformed", "not-a-date"), fixture("future", "2026-08-19T00:00:00Z")],
      {
        observedAt: new Date("2026-08-18T12:00:00Z"),
        maxAgeDays: 30,
      },
    );

    expect(audit.invalid).toBe(2);
    expect(audit.invalidTargetIds).toEqual(["future", "malformed"]);
    expect(audit.oldestVerifiedAt).toBeNull();
    expect(audit.latestVerifiedAt).toBeNull();
  });

  it("makes duplicate ids and missing evidence visible as catalog integrity debt", () => {
    const noEvidenceAuthority = { ...AUTHORITY, verificationEvidenceUri: "" };
    const first = buildPriorityNationalSourceCoverageTarget(noEvidenceAuthority, {
      id: "duplicate",
      family: "PORTAL",
      displayName: "First",
      canonicalUri: "https://example.test/first",
    });
    const second = { ...first, canonicalUri: "https://example.test/second" };

    const audit = auditSourceCoverageVerification([first, second], {
      observedAt: new Date("2026-08-18T12:00:00Z"),
      maxAgeDays: 30,
    });

    expect(audit.duplicateTargetIds).toEqual(["duplicate"]);
    expect(audit.missingEvidenceTargetIds).toEqual(["duplicate", "duplicate"]);
  });

  it("keeps the live national catalog structurally auditable without changing its coverage data", () => {
    const audit = auditSourceCoverageVerification(PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS, {
      observedAt: new Date("2026-08-29T11:45:00Z"),
      maxAgeDays: 3650,
    });
    const jurisdictions = new Set(
      PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS.map((target) => target.jurisdiction),
    );

    expect(audit.total).toBe(PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS.length);
    expect(audit.total).toBeGreaterThan(100);
    expect(jurisdictions.size).toBeGreaterThanOrEqual(100);
    expect(audit.invalidTargetIds).toEqual([]);
    expect(audit.duplicateTargetIds).toEqual([]);
    expect(audit.missingEvidenceTargetIds).toEqual([]);
  });

  it("rejects an implicit or invalid audit clock", () => {
    expect(() =>
      auditSourceCoverageVerification([fixture("target")], {
        observedAt: new Date("invalid"),
        maxAgeDays: 30,
      }),
    ).toThrow("observedAt must be a valid Date");
    expect(() =>
      auditSourceCoverageVerification([fixture("target")], {
        observedAt: new Date("2026-08-18T12:00:00Z"),
        maxAgeDays: 1.5,
      }),
    ).toThrow("maxAgeDays must be a non-negative integer");
  });
});
