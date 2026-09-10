import { SOURCE_COVERAGE_TARGETS } from "@markorbit/persistence/source-coverage";
import type { SourceCoverageTarget } from "@markorbit/contracts";
import type {
  WebAcquisitionCampaignManifestV1,
  WebAcquisitionCampaignSourceV1,
} from "./web-acquisition-campaign";

export const OFFICIAL_SCALE_CAMPAIGN_ID = "official-scale-60-v1";
export const OFFICIAL_SCALE_DOMAIN_COUNT = 60;

const OFFICIAL_SCALE_TARGET_IDS = [
  "ae-moet-trademarks",
  "al-dppi-industrial-property-portal",
  "am-aipo-trademark-portal",
  "ao-iapi-portal",
  "ar-inpi-trademark-portal",
  "at-patentamt-trademarks",
  "au-ipaustralia-trademarks",
  "az-copat-trademark-portal",
  "ba-ipr-trademark-portal",
  "bd-dpdt-trademarks",
  "be-boip-trademark-portal",
  "bg-bpo-trademarks",
  "bh-moic-trademarks",
  "bn-bruipo-portal",
  "bo-senapi-portal",
  "br-inpi-trademarks",
  "by-ncip-trademark-portal",
  "ca-cipo-trademarks",
  "cd-industry-ministry-portal",
  "ch-ipi-trademarks",
  "ci-oapi-portal",
  "cl-inapi-trademarks",
  "cn-cnipa-trademark-portal",
  "co-sic-trademarks",
  "cr-rpi-portal",
  "cu-ocpi-portal",
  "cy-ip-trademarks",
  "cz-upv-trademarks",
  "de-dpma-trademarks",
  "dk-dkpto-trademarks",
  "do-onapi-portal",
  "dz-inapi-trademark-portal",
  "ec-senadi-portal",
  "ee-epa-trademarks",
  "eg-eipa-operational-ip-portal",
  "es-oepm-trademarks",
  "et-eipa-portal",
  "eu-euipo-trademarks-root",
  "fi-prh-trademarks",
  "fr-inpi-trademark-portal",
  "gb-ukipo-register-trademark",
  "ge-sakpatenti-trademark-portal",
  "gh-rgd-industrial-property-portal",
  "gr-obi-trademarks",
  "gt-rpi-portal",
  "hk-ipd-trademark-portal",
  "hn-digepih-ip-portal",
  "hr-dziv-trademarks",
  "hu-hipo-trademarks",
  "id-djki-trademarks",
  "ie-ipoi-trademarks",
  "il-ilpo-trademark-portal",
  "in-ipindia-trademarks",
  "iq-moim-industrial-property-platform",
  "is-isipo-trademarks",
  "it-uibm-trademarks",
  "jm-jipo-portal",
  "jo-ippd-trademarks",
  "jp-jpo-trademark-procedures",
  "ke-kipi-trademark-portal",
] as const;

function eligible(target: SourceCoverageTarget): boolean {
  return (
    target.catalogState === "ACTIVE" &&
    target.sourceType === "WEB" &&
    target.category === "OFFICIAL_AUTHORITY" &&
    target.authorityLevel === "PRIMARY_OFFICIAL" &&
    target.acquisition.mode === "WEB_CRAWL" &&
    target.acquisition.renderJavascriptHint === false &&
    target.canonicalUri.startsWith("https://")
  );
}
function sourceFromTarget(target: SourceCoverageTarget): WebAcquisitionCampaignSourceV1 {
  const canonicalUrl = new URL(target.canonicalUri);
  return {
    key: target.id,
    name: target.displayName,
    sourceClass: "OFFICIAL_AUTHORITY",
    jurisdictions: [target.jurisdiction],
    languages: [...target.languages],
    baseUrl: target.canonicalUri,
    allowedHosts: [canonicalUrl.hostname],
    discovery: { mode: "EXACT_URL_LIST", exactUrls: [target.canonicalUri] },
    maxPages: 1,
    maxDepth: 0,
    rateLimitPerMinute: 6,
    renderJavascript: false,
  };
}

export function buildOfficialScaleCampaignManifest(
  workspaceId: string,
  domainCount = OFFICIAL_SCALE_DOMAIN_COUNT,
): WebAcquisitionCampaignManifestV1 {
  const normalizedWorkspaceId = workspaceId.trim();
  if (!normalizedWorkspaceId) throw new Error("Official scale campaign workspaceId is required");
  if (domainCount !== OFFICIAL_SCALE_DOMAIN_COUNT) {
    throw new Error(
      `Official scale campaign v1 must contain exactly ${OFFICIAL_SCALE_DOMAIN_COUNT} domains`,
    );
  }

  const targetsById = new Map(SOURCE_COVERAGE_TARGETS.map((target) => [target.id, target]));
  const selected = OFFICIAL_SCALE_TARGET_IDS.slice(0, domainCount).map((targetId) => {
    const target = targetsById.get(targetId);
    if (!target || !eligible(target)) {
      throw new Error(`Governed official scale target ${targetId} is unavailable or ineligible`);
    }
    return target;
  });
  const jurisdictions = new Set(selected.map((target) => target.jurisdiction));
  const hosts = new Set(
    selected.map((target) => new URL(target.canonicalUri).hostname.toLowerCase()),
  );
  if (jurisdictions.size !== selected.length || hosts.size !== selected.length) {
    throw new Error("Pinned official scale cohort must keep unique jurisdictions and hosts");
  }

  return {
    version: "1.0",
    campaignId: OFFICIAL_SCALE_CAMPAIGN_ID,
    name: `Official governed scale campaign — ${domainCount} domains`,
    workspaceId: normalizedWorkspaceId,
    globalConcurrency: 8,
    sources: selected.map(sourceFromTarget),
  };
}
