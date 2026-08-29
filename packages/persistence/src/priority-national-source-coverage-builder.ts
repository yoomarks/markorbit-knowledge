import {
  SOURCE_COVERAGE_PROTOCOL_VERSION,
  type SourceCoverageCatalogState,
  type SourceCoverageChangeSensitivity,
  type SourceCoverageFamily,
  type SourceCoverageTarget,
  type SourceCoverageTier,
} from "@markorbit/contracts";

export const PRIORITY_NATIONAL_DEFAULT_VERIFIED_AT = "2026-08-16T00:00:00Z";

export type PriorityNationalCoverageAuthority = {
  jurisdiction: string;
  authorityName: string;
  languages: string[];
  verificationEvidenceUri: string;
};

export type PriorityNationalCoverageTargetInput = {
  id: string;
  family: SourceCoverageFamily;
  displayName: string;
  canonicalUri: string;
  entrypoints?: SourceCoverageTarget["entrypoints"];
  coverageTier?: SourceCoverageTier;
  catalogState?: SourceCoverageCatalogState;
  changeSensitivity?: SourceCoverageChangeSensitivity;
  mode?: SourceCoverageTarget["acquisition"]["mode"];
  renderJavascriptHint?: boolean;
  fetchAttachmentsHint?: boolean;
  expectedArtifactKinds?: SourceCoverageTarget["acquisition"]["expectedArtifactKinds"];
  verifiedAt?: string;
  verificationEvidenceUri?: string;
  notes?: string;
};

type PriorityNationalCoverageTargetOverride = Partial<
  Omit<PriorityNationalCoverageTargetInput, "id" | "family">
>;

const IP_INDIA_SEARCH_GUIDANCE_URI =
  "https://ipindia.gov.in/trade-marks-before-you-apply-search-existing-trademarks";

/**
 * Evidence-driven corrections for national declarations whose public guidance and protected
 * service entrypoints have different acquisition boundaries. Keep these narrow and explicit:
 * they refine catalog evidence only and never authorize access to protected services.
 */
const PRIORITY_NATIONAL_CURATED_OVERRIDES: Readonly<
  Record<string, PriorityNationalCoverageTargetOverride>
> = {
  "in-ipindia-trademark-search": {
    displayName: "IP India Search Existing Trademarks Guidance",
    canonicalUri: IP_INDIA_SEARCH_GUIDANCE_URI,
    entrypoints: [
      { uri: IP_INDIA_SEARCH_GUIDANCE_URI, label: "Search guidance" },
      {
        uri: "https://tmsearch.ipindia.gov.in/ords/r/tisa/trademark_search600/login",
        label: "Protected AI/ML search (account + OTP)",
      },
      {
        uri: "https://tmrsearch.ipindia.gov.in/tmrpublicsearch/",
        label: "Protected public search (CAPTCHA + OTP)",
      },
    ],
    mode: "WEB_CRAWL",
    renderJavascriptHint: false,
    fetchAttachmentsHint: false,
    expectedArtifactKinds: ["HTML", "MARKDOWN"],
    verifiedAt: "2026-08-29T11:36:00Z",
    verificationEvidenceUri: IP_INDIA_SEARCH_GUIDANCE_URI,
    notes:
      "The canonical guidance page is publicly crawlable. Its two official search applications are protected by account/OTP or CAPTCHA/OTP; this coverage target does not claim anonymous structured-search access.",
  },
};

/**
 * Builds a version-controlled national coverage target. The catalog declaration is
 * evidence metadata only; it never creates a Source, CollectionPlan or collection authorization.
 *
 * `verifiedAt` is intentionally target-scoped so independently re-verifying one endpoint does
 * not falsely advance every other target in the national catalog.
 */
export function buildPriorityNationalSourceCoverageTarget(
  authority: PriorityNationalCoverageAuthority,
  input: PriorityNationalCoverageTargetInput,
): SourceCoverageTarget {
  const resolvedInput = {
    ...input,
    ...PRIORITY_NATIONAL_CURATED_OVERRIDES[input.id],
  } satisfies PriorityNationalCoverageTargetInput;

  return {
    protocolVersion: SOURCE_COVERAGE_PROTOCOL_VERSION,
    objectType: "SOURCE_COVERAGE_TARGET",
    jurisdiction: authority.jurisdiction,
    authorityName: authority.authorityName,
    authorityBasis: "EXPLICIT_CURATED",
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    languages: [...authority.languages],
    catalogState: resolvedInput.catalogState ?? "ACTIVE",
    coverageTier: resolvedInput.coverageTier ?? "FOUNDATIONAL",
    changeSensitivity: resolvedInput.changeSensitivity ?? "HIGH",
    verifiedAt: resolvedInput.verifiedAt ?? PRIORITY_NATIONAL_DEFAULT_VERIFIED_AT,
    id: resolvedInput.id,
    family: resolvedInput.family,
    displayName: resolvedInput.displayName,
    canonicalUri: resolvedInput.canonicalUri,
    entrypoints: resolvedInput.entrypoints ?? [{ uri: resolvedInput.canonicalUri }],
    acquisition: {
      mode: resolvedInput.mode ?? "WEB_CRAWL",
      renderJavascriptHint: resolvedInput.renderJavascriptHint ?? false,
      fetchAttachmentsHint: resolvedInput.fetchAttachmentsHint ?? false,
      expectedArtifactKinds: resolvedInput.expectedArtifactKinds ?? ["HTML", "MARKDOWN"],
    },
    verificationEvidenceUri:
      resolvedInput.verificationEvidenceUri ?? authority.verificationEvidenceUri,
    ...(resolvedInput.notes ? { notes: resolvedInput.notes } : {}),
  };
}
