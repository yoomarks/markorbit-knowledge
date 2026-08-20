import type { SourceCoverageTarget } from "@markorbit/contracts";
import { RegistryValidationError } from "./index";
import {
  REPRESENTATIVE_SOURCE_ACTIVATION_JURISDICTIONS,
  type RepresentativeSourceActivationJurisdiction,
  type RepresentativeSourceActivationProfile,
} from "./representative-source-activation";
import { listSourceCoverageTargets } from "./source-coverage-catalog";

export const REPRESENTATIVE_SOURCE_LIVE_CANARY_VERSION =
  "REPRESENTATIVE_SOURCE_LIVE_CANARY_V2" as const;

export const REPRESENTATIVE_SOURCE_LIVE_CANARY_JURISDICTIONS = [
  ...REPRESENTATIVE_SOURCE_ACTIVATION_JURISDICTIONS,
  {
    jurisdiction: "NZ",
    displayName: "New Zealand",
    profile: "DYNAMIC_PORTAL",
    purpose: "IPONZ modern web guidance plus JavaScript-rendered trademark search paths.",
  },
] as const satisfies readonly RepresentativeSourceActivationJurisdiction[];

export type RepresentativeSourceLiveCanaryBaseline = {
  targetId: string;
  family: string;
  canonicalUri: string;
  renderJavascript: boolean;
  expectedArtifactKinds: string[];
};

export type RepresentativeSourceLiveCanary = {
  version: typeof REPRESENTATIVE_SOURCE_LIVE_CANARY_VERSION;
  jurisdiction: string;
  displayName: string;
  profile: RepresentativeSourceActivationProfile;
  targetId: string;
  family: string;
  canonicalUri: string;
  languages: string[];
  renderJavascript: boolean;
  expectedArtifactKinds: string[];
  authorityBaseline: RepresentativeSourceLiveCanaryBaseline;
};

const PROFILE_FAMILY_PREFERENCE: Record<RepresentativeSourceActivationProfile, string[]> = {
  CORE_MARKET: ["PORTAL", "FILING", "SEARCH"],
  DYNAMIC_PORTAL: ["SEARCH", "PORTAL", "FILING"],
  MULTILINGUAL: ["SEARCH", "PORTAL", "FILING"],
  MENA: ["PORTAL", "FILING", "SEARCH"],
  REGIONAL_EUIPO: ["PORTAL", "FILING", "SEARCH"],
  REGIONAL_OAPI: ["PORTAL", "FILING", "SEARCH"],
};

const BASELINE_FAMILY_PREFERENCE = ["FILING", "PORTAL", "LEGAL_TEXTS", "FEES"];

function targetRank(
  target: SourceCoverageTarget,
  profile: RepresentativeSourceActivationProfile,
): number {
  const familyIndex = PROFILE_FAMILY_PREFERENCE[profile].indexOf(target.family);
  const familyRank = familyIndex < 0 ? 100 : familyIndex * 10;
  const javascriptBonus =
    (profile === "DYNAMIC_PORTAL" || profile === "MULTILINGUAL") &&
    target.acquisition.renderJavascriptHint
      ? -3
      : 0;
  const htmlBonus = target.acquisition.expectedArtifactKinds.includes("HTML") ? -1 : 20;
  return familyRank + javascriptBonus + htmlBonus;
}

function baselineRank(target: SourceCoverageTarget): number {
  const familyIndex = BASELINE_FAMILY_PREFERENCE.indexOf(target.family);
  return familyIndex < 0 ? 100 : familyIndex * 10;
}

function selectCanaryTarget(
  jurisdiction: string,
  profile: RepresentativeSourceActivationProfile,
  targets: readonly SourceCoverageTarget[],
): SourceCoverageTarget {
  const candidates = targets
    .filter(
      (target) =>
        target.jurisdiction === jurisdiction &&
        target.catalogState === "ACTIVE" &&
        target.coverageTier === "FOUNDATIONAL" &&
        target.sourceType === "WEB" &&
        target.acquisition.expectedArtifactKinds.includes("HTML"),
    )
    .sort(
      (left, right) =>
        targetRank(left, profile) - targetRank(right, profile) || left.id.localeCompare(right.id),
    );
  const selected = candidates[0];
  if (!selected) {
    throw new RegistryValidationError(
      `No HTML-capable foundational live canary target exists for ${jurisdiction}`,
    );
  }
  return selected;
}

function selectAuthorityBaseline(
  primary: SourceCoverageTarget,
  targets: readonly SourceCoverageTarget[],
): SourceCoverageTarget | undefined {
  return targets
    .filter(
      (target) =>
        target.id !== primary.id &&
        target.jurisdiction === primary.jurisdiction &&
        target.catalogState === "ACTIVE" &&
        target.coverageTier === "FOUNDATIONAL" &&
        target.sourceType === "WEB" &&
        !target.acquisition.renderJavascriptHint &&
        target.acquisition.expectedArtifactKinds.includes("HTML"),
    )
    .sort(
      (left, right) => baselineRank(left) - baselineRank(right) || left.id.localeCompare(right.id),
    )[0];
}

export function getRepresentativeSourceLiveCanaries(): RepresentativeSourceLiveCanary[] {
  const targets = listSourceCoverageTargets({
    coverageTier: "FOUNDATIONAL",
    catalogState: "ACTIVE",
  });
  const canaries = REPRESENTATIVE_SOURCE_LIVE_CANARY_JURISDICTIONS.map((jurisdiction) => {
    const target = selectCanaryTarget(jurisdiction.jurisdiction, jurisdiction.profile, targets);
    const baseline = selectAuthorityBaseline(target, targets);
    if (!baseline) {
      throw new RegistryValidationError(
        `Live canary ${target.id} has no distinct low-interaction authority baseline`,
      );
    }
    return {
      version: REPRESENTATIVE_SOURCE_LIVE_CANARY_VERSION,
      jurisdiction: jurisdiction.jurisdiction,
      displayName: jurisdiction.displayName,
      profile: jurisdiction.profile,
      targetId: target.id,
      family: target.family,
      canonicalUri: target.canonicalUri,
      languages: [...target.languages],
      renderJavascript: target.acquisition.renderJavascriptHint,
      expectedArtifactKinds: [...target.acquisition.expectedArtifactKinds],
      authorityBaseline: {
        targetId: baseline.id,
        family: baseline.family,
        canonicalUri: baseline.canonicalUri,
        renderJavascript: baseline.acquisition.renderJavascriptHint,
        expectedArtifactKinds: [...baseline.acquisition.expectedArtifactKinds],
      },
    } satisfies RepresentativeSourceLiveCanary;
  });

  const duplicateTargets = canaries.filter(
    (canary, index) => canaries.findIndex((item) => item.targetId === canary.targetId) !== index,
  );
  if (duplicateTargets.length > 0) {
    throw new RegistryValidationError(
      `Representative live canaries must use distinct targets: ${duplicateTargets
        .map((item) => item.targetId)
        .join(", ")}`,
    );
  }
  return canaries;
}
