import { SOURCE_COVERAGE_TARGETS } from "@markorbit/persistence/source-coverage";
import type { SourceCoverageTarget } from "@markorbit/contracts";
import type {
  WebAcquisitionCampaignManifestV1,
  WebAcquisitionCampaignSourceV1,
} from "./web-acquisition-campaign";

export const OFFICIAL_SCALE_CAMPAIGN_ID = "official-scale-60-v1";
export const OFFICIAL_SCALE_DOMAIN_COUNT = 60;

const FAMILY_PRIORITY = new Map([
  ["PORTAL", 0],
  ["FILING", 1],
  ["FEES", 2],
  ["LEGAL_TEXTS", 3],
  ["EXAMINATION_MANUAL", 4],
]);

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
function familyRank(target: SourceCoverageTarget): number {
  return FAMILY_PRIORITY.get(target.family) ?? 100;
}

function candidateOrder(left: SourceCoverageTarget, right: SourceCoverageTarget): number {
  return (
    familyRank(left) - familyRank(right) ||
    left.jurisdiction.localeCompare(right.jurisdiction) ||
    left.canonicalUri.localeCompare(right.canonicalUri) ||
    left.id.localeCompare(right.id)
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
  if (!Number.isInteger(domainCount) || domainCount < 50 || domainCount > 100) {
    throw new Error("Official scale campaign domainCount must be an integer in 50..100");
  }

  const selected: SourceCoverageTarget[] = [];
  const jurisdictions = new Set<string>();
  const hosts = new Set<string>();
  for (const target of [...SOURCE_COVERAGE_TARGETS.filter(eligible)].sort(candidateOrder)) {
    const host = new URL(target.canonicalUri).hostname.toLowerCase();
    if (jurisdictions.has(target.jurisdiction) || hosts.has(host)) continue;
    selected.push(target);
    jurisdictions.add(target.jurisdiction);
    hosts.add(host);
    if (selected.length === domainCount) break;
  }

  if (selected.length !== domainCount) {
    throw new Error(`Only ${selected.length} eligible governed official domains are available`);
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
