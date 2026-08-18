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
    catalogState: input.catalogState ?? "ACTIVE",
    coverageTier: input.coverageTier ?? "FOUNDATIONAL",
    changeSensitivity: input.changeSensitivity ?? "HIGH",
    verifiedAt: input.verifiedAt ?? PRIORITY_NATIONAL_DEFAULT_VERIFIED_AT,
    id: input.id,
    family: input.family,
    displayName: input.displayName,
    canonicalUri: input.canonicalUri,
    entrypoints: input.entrypoints ?? [{ uri: input.canonicalUri }],
    acquisition: {
      mode: input.mode ?? "WEB_CRAWL",
      renderJavascriptHint: input.renderJavascriptHint ?? false,
      fetchAttachmentsHint: input.fetchAttachmentsHint ?? false,
      expectedArtifactKinds: input.expectedArtifactKinds ?? ["HTML", "MARKDOWN"],
    },
    verificationEvidenceUri: input.verificationEvidenceUri ?? authority.verificationEvidenceUri,
    ...(input.notes ? { notes: input.notes } : {}),
  };
}
