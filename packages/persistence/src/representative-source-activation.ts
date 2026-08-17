import type { SourceCoverageTarget } from "@markorbit/contracts";
import { RegistryValidationError } from "./index";
import { listSourceCoverageTargets } from "./source-coverage-catalog";

export const REPRESENTATIVE_SOURCE_ACTIVATION_WAVE_VERSION =
  "REPRESENTATIVE_SOURCE_ACTIVATION_V1" as const;

export type RepresentativeSourceActivationProfile =
  | "CORE_MARKET"
  | "DYNAMIC_PORTAL"
  | "MULTILINGUAL"
  | "MENA"
  | "REGIONAL_EUIPO"
  | "REGIONAL_OAPI";

export type RepresentativeSourceActivationJurisdiction = {
  jurisdiction: string;
  displayName: string;
  profile: RepresentativeSourceActivationProfile;
  purpose: string;
};

export const REPRESENTATIVE_SOURCE_ACTIVATION_JURISDICTIONS = [
  {
    jurisdiction: "CN",
    displayName: "China",
    profile: "DYNAMIC_PORTAL",
    purpose: "CNIPA portal, guidance, search, fees and legal-text acquisition paths.",
  },
  {
    jurisdiction: "US",
    displayName: "United States",
    profile: "CORE_MARKET",
    purpose: "USPTO guidance, search, fee and examination-source paths.",
  },
  {
    jurisdiction: "IN",
    displayName: "India",
    profile: "DYNAMIC_PORTAL",
    purpose: "Large-market registry with mixed portal and document acquisition behavior.",
  },
  {
    jurisdiction: "JP",
    displayName: "Japan",
    profile: "MULTILINGUAL",
    purpose: "JPO/J-PlatPat multilingual and structured-search acquisition paths.",
  },
  {
    jurisdiction: "KR",
    displayName: "Republic of Korea",
    profile: "MULTILINGUAL",
    purpose: "KIPO/KIPRIS multilingual and structured-search acquisition paths.",
  },
  {
    jurisdiction: "GB",
    displayName: "United Kingdom",
    profile: "CORE_MARKET",
    purpose: "UKIPO guidance, search and legal-source acquisition paths.",
  },
  {
    jurisdiction: "CA",
    displayName: "Canada",
    profile: "MULTILINGUAL",
    purpose: "CIPO bilingual official guidance and search acquisition paths.",
  },
  {
    jurisdiction: "AU",
    displayName: "Australia",
    profile: "CORE_MARKET",
    purpose: "IP Australia modern web guidance and search acquisition paths.",
  },
  {
    jurisdiction: "BR",
    displayName: "Brazil",
    profile: "MULTILINGUAL",
    purpose: "INPI Brazil non-English portal, fee and legal-source acquisition paths.",
  },
  {
    jurisdiction: "AE",
    displayName: "United Arab Emirates",
    profile: "MENA",
    purpose: "MENA official portal and service-guidance acquisition behavior.",
  },
  {
    jurisdiction: "NL",
    displayName: "Netherlands / EUIPO regional path",
    profile: "REGIONAL_EUIPO",
    purpose: "Regional EUIPO source reuse represented through a curated regional jurisdiction.",
  },
  {
    jurisdiction: "CI",
    displayName: "Côte d'Ivoire / OAPI regional path",
    profile: "REGIONAL_OAPI",
    purpose: "Shared OAPI physical sources represented through a regional member jurisdiction.",
  },
] as const satisfies readonly RepresentativeSourceActivationJurisdiction[];

export type RepresentativeSourceActivationWave = {
  version: typeof REPRESENTATIVE_SOURCE_ACTIVATION_WAVE_VERSION;
  jurisdictions: readonly RepresentativeSourceActivationJurisdiction[];
  targets: SourceCoverageTarget[];
  targetIds: string[];
};

export function getRepresentativeSourceActivationWave(): RepresentativeSourceActivationWave {
  const jurisdictionSet = new Set<string>(
    REPRESENTATIVE_SOURCE_ACTIVATION_JURISDICTIONS.map((item) => item.jurisdiction),
  );
  const targets = listSourceCoverageTargets({ catalogState: "ACTIVE" }).filter((target) =>
    jurisdictionSet.has(target.jurisdiction),
  );
  const coveredJurisdictions = new Set(targets.map((target) => target.jurisdiction));
  const missingJurisdictions = REPRESENTATIVE_SOURCE_ACTIVATION_JURISDICTIONS.filter(
    (item) => !coveredJurisdictions.has(item.jurisdiction),
  );
  if (missingJurisdictions.length > 0) {
    throw new RegistryValidationError(
      `Representative activation wave is missing curated targets for: ${missingJurisdictions
        .map((item) => item.jurisdiction)
        .join(", ")}`,
    );
  }
  if (targets.length === 0 || targets.length > 100) {
    throw new RegistryValidationError(
      `Representative activation wave must contain between 1 and 100 targets; found ${targets.length}`,
    );
  }
  return {
    version: REPRESENTATIVE_SOURCE_ACTIVATION_WAVE_VERSION,
    jurisdictions: REPRESENTATIVE_SOURCE_ACTIVATION_JURISDICTIONS,
    targets,
    targetIds: targets.map((target) => target.id),
  };
}
