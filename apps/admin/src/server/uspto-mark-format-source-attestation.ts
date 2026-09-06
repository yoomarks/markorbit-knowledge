import { createHash } from "node:crypto";
import {
  USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1,
  assessUsptoMarkFormatSourceEvidenceV1,
  type UsptoMarkFormatSourceEvidenceV1,
  type UsptoMarkFormatSourceKey,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryValidationError,
  type SourceRepository,
} from "@markorbit/persistence";
import type { RawArtifactRepository } from "@markorbit/persistence/raw-artifacts";
import type { RetrievalIndexRepository } from "@markorbit/persistence/retrieval-index";
import type { StagingContentRegistryRepository } from "@markorbit/persistence/staging-content";

type FetchLike = (
  input: string,
) => Promise<{ ok: boolean; status: number; url: string; text(): Promise<string> }>;

export type UsptoMarkFormatHttpObservation = {
  canonicalUri: string;
  bodySha256: string;
  anchorsMatched: string[];
  lastUpdatedDate: string;
};

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};
function normalizeVisibleText(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;|&#160;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function normalizedAnchor(value: string): string {
  return value.replace(/\s+/gu, " ").trim().toLowerCase();
}

export function matchedUsptoMarkFormatAnchors(text: string, anchors: readonly string[]): string[] {
  const normalized = normalizeVisibleText(text);
  return anchors.filter((anchor) => normalized.includes(normalizedAnchor(anchor)));
}

export function extractUsptoLastUpdatedDate(text: string): string | null {
  const normalized = normalizeVisibleText(text);
  const match = normalized.match(/last updated on:\s*([a-z]{3,9})\s+(\d{1,2}),\s+(\d{4})/u);
  if (!match) return null;
  const month = MONTHS[match[1].slice(0, 3)];
  if (!month) return null;
  return `${match[3]}-${month}-${match[2].padStart(2, "0")}`;
}
export async function observeUsptoMarkFormatHttp(
  sourceKey: UsptoMarkFormatSourceKey,
  fetchImpl: FetchLike = fetch,
): Promise<UsptoMarkFormatHttpObservation> {
  const source = USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1.sources.find(
    (candidate) => candidate.sourceKey === sourceKey,
  );
  if (!source) throw new RegistryValidationError(`Unknown USPTO mark-format source: ${sourceKey}`);

  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetchImpl(source.canonicalUri);
  } catch (error) {
    throw new RegistryConflictError(
      "USPTO_MARK_FORMAT_HTTP_UNAVAILABLE",
      `USPTO HTTP corroboration failed for ${source.sourceKey}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!response.ok) {
    throw new RegistryConflictError(
      "USPTO_MARK_FORMAT_HTTP_UNAVAILABLE",
      `USPTO HTTP corroboration returned ${response.status} for ${source.sourceKey}`,
    );
  }
  if (response.url !== source.canonicalUri) {
    throw new RegistryConflictError(
      "USPTO_MARK_FORMAT_HTTP_URI_DRIFT",
      `USPTO HTTP corroboration resolved to ${response.url || "<missing>"}`,
    );
  }

  const body = await response.text();
  const lastUpdatedDate = extractUsptoLastUpdatedDate(body);
  if (!lastUpdatedDate) {
    throw new RegistryConflictError(
      "USPTO_MARK_FORMAT_HTTP_METADATA_MISSING",
      `USPTO HTTP corroboration is missing Last updated metadata for ${source.sourceKey}`,
    );
  }
  return {
    canonicalUri: source.canonicalUri,
    bodySha256: createHash("sha256").update(body, "utf8").digest("hex"),
    anchorsMatched: matchedUsptoMarkFormatAnchors(body, source.requiredAnchors),
    lastUpdatedDate,
  };
}
export type UsptoMarkFormatAttestationDependencies = {
  sources: Pick<SourceRepository, "getById">;
  rawArtifacts: Pick<RawArtifactRepository, "getArtifact">;
  retrieval: Pick<RetrievalIndexRepository, "search" | "listChunks">;
  staging: Pick<StagingContentRegistryRepository, "readContent">;
  fetchImpl?: FetchLike;
};

function requiredSource(
  dependencies: UsptoMarkFormatAttestationDependencies,
  workspaceId: string,
  sourceId: string,
  sourceKey: UsptoMarkFormatSourceKey,
) {
  const expected = USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1.sources.find(
    (candidate) => candidate.sourceKey === sourceKey,
  );
  if (!expected)
    throw new RegistryValidationError(`Unknown USPTO mark-format source: ${sourceKey}`);
  const source = dependencies.sources.getById(sourceId);
  if (!source) {
    throw new RegistryConflictError(
      "USPTO_MARK_FORMAT_SOURCE_MISSING",
      `USPTO mark-format Source ${sourceId} is missing`,
    );
  }
  if (source.workspaceId !== workspaceId) {
    throw new RegistryConflictError(
      "USPTO_MARK_FORMAT_WORKSPACE_MISMATCH",
      `USPTO mark-format Source ${sourceId} belongs to another workspace`,
    );
  }
  const extensions = source.extensions ?? {};
  if (
    source.canonicalUri !== expected.canonicalUri ||
    extensions["x-markorbit-reference-profile"] !==
      USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1.profileId ||
    extensions["x-markorbit-source-version"] !== expected.sourceVersion ||
    extensions["x-markorbit-source-last-updated"] !== expected.expectedLastUpdatedDate
  ) {
    throw new RegistryConflictError(
      "USPTO_MARK_FORMAT_SOURCE_IDENTITY_DRIFT",
      `USPTO mark-format Source ${sourceId} no longer matches ${sourceKey}`,
    );
  }
  return { source, expected };
}
function collectFactBindings(
  dependencies: UsptoMarkFormatAttestationDependencies,
  workspaceId: string,
  sourceId: string,
  sourceKey: UsptoMarkFormatSourceKey,
) {
  const expected = USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1.sources.find(
    (candidate) => candidate.sourceKey === sourceKey,
  );
  if (!expected)
    throw new RegistryValidationError(`Unknown USPTO mark-format source: ${sourceKey}`);

  const located = dependencies.retrieval.search({
    workspaceId,
    query: expected.locatorQuery,
    sourceId,
    jurisdiction: "US",
    authorityLevel: "PRIMARY_OFFICIAL",
    limit: 10,
  });
  const hit = located.items.find(
    (candidate) =>
      candidate.document.sourceId === sourceId &&
      candidate.document.sourceUri === expected.canonicalUri &&
      candidate.document.canonicalUri === expected.canonicalUri &&
      candidate.document.isCurrent,
  );
  if (!hit) {
    throw new RegistryConflictError(
      "USPTO_MARK_FORMAT_DOCUMENT_EVIDENCE_MISSING",
      `No current exact retrieval document for ${sourceKey}`,
    );
  }

  const chunks = dependencies.retrieval
    .listChunks(hit.document.stagingDocumentId, workspaceId)
    .slice()
    .sort((left, right) => left.ordinal - right.ordinal);
  const segments: Array<{ chunk: (typeof chunks)[number]; start: number; end: number }> = [];
  let stream = "";
  for (const chunk of chunks) {
    const text = normalizeVisibleText(chunk.text);
    if (!text) continue;
    if (stream) stream += " ";
    const start = stream.length;
    stream += text;
    segments.push({ chunk, start, end: stream.length });
  }

  return expected.evidenceQueries.flatMap((query) => {
    const anchor = normalizedAnchor(query.passageAnchor);
    const occurrences: number[] = [];
    for (
      let offset = stream.indexOf(anchor);
      offset >= 0;
      offset = stream.indexOf(anchor, offset + 1)
    ) {
      occurrences.push(offset);
    }
    if (occurrences.length > 1) {
      throw new RegistryConflictError(
        "USPTO_MARK_FORMAT_FACT_EVIDENCE_AMBIGUOUS",
        `Expected one exact passage for ${sourceKey}/${query.factId}; found ${occurrences.length}`,
      );
    }
    if (occurrences.length === 1) {
      const start = occurrences[0]!;
      const end = start + anchor.length;
      const matched = segments.filter((segment) => segment.start < end && segment.end > start);
      if (matched.length > 0) {
        return matched.map(({ chunk }) => ({ query, document: hit.document, chunk }));
      }
    }

    const headingMatches = chunks.filter((chunk) =>
      normalizeVisibleText([...chunk.headingPath, chunk.text].join(" ")).includes(anchor),
    );
    if (headingMatches.length !== 1) {
      throw new RegistryConflictError(
        "USPTO_MARK_FORMAT_FACT_EVIDENCE_AMBIGUOUS",
        `Expected one exact passage for ${sourceKey}/${query.factId}; found ${headingMatches.length}`,
      );
    }
    return [{ query, document: hit.document, chunk: headingMatches[0]! }];
  });
}
export async function attestUsptoMarkFormatSource(input: {
  workspaceId: string;
  sourceId: string;
  sourceKey: UsptoMarkFormatSourceKey;
  dependencies: UsptoMarkFormatAttestationDependencies;
  now?: Date;
}): Promise<UsptoMarkFormatSourceEvidenceV1> {
  const { expected } = requiredSource(
    input.dependencies,
    input.workspaceId,
    input.sourceId,
    input.sourceKey,
  );
  const bindings = collectFactBindings(
    input.dependencies,
    input.workspaceId,
    input.sourceId,
    input.sourceKey,
  );
  const first = bindings[0];
  if (!first) {
    throw new RegistryConflictError(
      "USPTO_MARK_FORMAT_FACT_EVIDENCE_MISSING",
      `No exact retrieval evidence for ${input.sourceKey}`,
    );
  }

  for (const binding of bindings) {
    if (
      binding.document.documentId !== first.document.documentId ||
      binding.document.rawArtifactId !== first.document.rawArtifactId ||
      binding.document.artifactVersion !== first.document.artifactVersion ||
      binding.document.contentSha256 !== first.document.contentSha256 ||
      binding.document.indexedAt !== first.document.indexedAt
    ) {
      throw new RegistryConflictError(
        "USPTO_MARK_FORMAT_RETRIEVAL_IDENTITY_SPLIT",
        `Fact bindings for ${input.sourceKey} do not share one exact document version`,
      );
    }
  }
  const raw = input.dependencies.rawArtifacts.getArtifact(first.document.rawArtifactId);
  if (!raw) {
    throw new RegistryConflictError(
      "USPTO_MARK_FORMAT_RAW_ARTIFACT_MISSING",
      `RawArtifact ${first.document.rawArtifactId} is missing`,
    );
  }
  const artifact = raw.artifact;
  if (
    artifact.workspaceId !== input.workspaceId ||
    artifact.sourceId !== input.sourceId ||
    artifact.version !== first.document.artifactVersion ||
    artifact.provenance.sourceUri !== expected.canonicalUri ||
    (artifact.canonicalUri !== undefined && artifact.canonicalUri !== expected.canonicalUri)
  ) {
    throw new RegistryConflictError(
      "USPTO_MARK_FORMAT_RAW_ARTIFACT_LINEAGE_DRIFT",
      `RawArtifact ${artifact.id} does not preserve exact ${input.sourceKey} lineage`,
    );
  }

  const markdown = new TextDecoder("utf-8", { fatal: true }).decode(
    input.dependencies.staging.readContent(first.document.stagingDocumentId, input.workspaceId),
  );
  const browserAnchorsMatched = matchedUsptoMarkFormatAnchors(markdown, expected.requiredAnchors);
  const sourceLastUpdatedDate = expected.expectedLastUpdatedDate;
  const http = await observeUsptoMarkFormatHttp(input.sourceKey, input.dependencies.fetchImpl);
  const evidence: UsptoMarkFormatSourceEvidenceV1 = {
    protocolVersion: "1.0",
    objectType: "USPTO_MARK_FORMAT_SOURCE_EVIDENCE",
    profileId: USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1.profileId,
    sourceKey: input.sourceKey,
    sourceVersion: expected.sourceVersion,
    canonicalUri: expected.canonicalUri,
    sourceLastUpdatedDate,
    httpLastUpdatedDate: http.lastUpdatedDate,
    workspaceId: input.workspaceId,
    sourceId: input.sourceId,
    documentId: first.document.documentId,
    rawArtifactId: first.document.rawArtifactId,
    artifactVersion: first.document.artifactVersion,
    documentContentSha256: first.document.contentSha256,
    chunks: bindings.map(({ query, chunk }) => ({
      factId: query.factId,
      queryText: query.queryText,
      chunkId: chunk.chunkId,
      chunkContentSha256: chunk.contentSha256,
    })),
    capturedAt: first.document.capturedAt,
    indexedAt: first.document.indexedAt,
    isCurrent: first.document.isCurrent,
    browserAnchorsMatched,
    httpBodySha256: http.bodySha256,
    httpAnchorsMatched: http.anchorsMatched,
  };

  const assessment = assessUsptoMarkFormatSourceEvidenceV1(evidence, input.now);
  if (assessment.state !== "CURRENT") {
    throw new RegistryConflictError(
      "USPTO_MARK_FORMAT_EVIDENCE_NOT_CURRENT",
      `USPTO mark-format evidence for ${input.sourceKey} is ${assessment.state}: ${assessment.reasonCodes.join(",")}`,
    );
  }
  return evidence;
}
