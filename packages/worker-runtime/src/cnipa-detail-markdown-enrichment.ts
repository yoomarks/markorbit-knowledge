import { createHash } from "node:crypto";
import {
  CnipaAcquisitionError,
  type CnipaDocumentKind,
} from "./cnipa-trademark-judgment";
import type { CnipaKnowledgeDocumentSeedV1 } from "./cnipa-list-materializer";

export const CNIPA_DETAIL_MARKDOWN_ENRICHMENT_VERSION =
  "cnipa-detail-markdown-enrichment-v1" as const;

type DetailScalar = string | number | boolean | null;

export type CnipaDetailEvidenceEntryV1 = {
  path: string;
  value: DetailScalar;
};

export type CnipaDetailMarkdownEnrichmentV1 = {
  schemaVersion: typeof CNIPA_DETAIL_MARKDOWN_ENRICHMENT_VERSION;
  sourceAuthority: "CNIPA";
  documentKind: CnipaDocumentKind;
  sourceRecordId: string;
  logicalDocumentUri: string;
  title: string;
  listArtifactId: string;
  detailArtifactId: string;
  baseMarkdownSha256: string;
  detailBodySha256: string;
  enrichedMarkdownSha256: string;
  materialEvidence: readonly CnipaDetailEvidenceEntryV1[];
  markdownBody: string;
};

export type CnipaDetailMarkdownDecisionV1 =
  | {
      material: false;
      reason: "NO_NEW_DETAIL_EVIDENCE";
      baseMarkdownSha256: string;
      detailBodySha256: string;
    }
  | {
      material: true;
      enrichment: CnipaDetailMarkdownEnrichmentV1;
    };

const TRANSPORT_FIELDS = new Set([
  "code",
  "message",
  "msg",
  "success",
  "timestamp",
  "traceId",
  "requestId",
]);

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new CnipaAcquisitionError("CNIPA_SCHEMA_CHANGED", `${label} is required`, false);
  }
  return normalized;
}

function parseJson(content: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(content)) as unknown;
  } catch (error) {
    throw new CnipaAcquisitionError(
      "CNIPA_SCHEMA_CHANGED",
      "CNIPA DETAIL artifact was not valid UTF-8 JSON",
      false,
      undefined,
      error instanceof Error ? { cause: error } : undefined,
    );
  }
}

function pointerPath(parent: string, key: string | number): string {
  const token = String(key).replaceAll("~", "~0").replaceAll("/", "~1");
  return `${parent}/${token}`;
}

function flatten(value: unknown, path = ""): CnipaDetailEvidenceEntryV1[] {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return [{ path: path || "/", value: value as DetailScalar }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((child, index) => flatten(child, pointerPath(path, index)));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !(path === "" && TRANSPORT_FIELDS.has(key)))
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([key, child]) => flatten(child, pointerPath(path, key)));
  }
  return [];
}

function evidenceRoot(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const root = value as Record<string, unknown>;
  return root.data !== undefined ? root.data : root;
}

function normalizedText(value: DetailScalar): string {
  if (value === null) return "null";
  return String(value)
    .replace(/\r\n?/g, "\n")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase();
}

function presentInBase(markdown: string, value: DetailScalar): boolean {
  const normalized = normalizedText(value);
  if (!normalized) return true;
  const base = markdown
    .replace(/\r\n?/g, "\n")
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase();
  return base.includes(normalized);
}

function materialEvidence(
  baseMarkdown: string,
  detail: unknown,
): CnipaDetailEvidenceEntryV1[] {
  const seen = new Set<string>();
  const result: CnipaDetailEvidenceEntryV1[] = [];
  for (const entry of flatten(evidenceRoot(detail))) {
    const value = normalizedText(entry.value);
    if (!value || presentInBase(baseMarkdown, entry.value)) continue;
    const identity = `${entry.path}\u0000${JSON.stringify(entry.value)}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(entry);
  }
  return result;
}

function markdownValue(value: DetailScalar): string {
  const rendered = JSON.stringify(value);
  return `\`${rendered.replaceAll("\`", "\\\`")}\``;
}

function renderEnrichedMarkdown(
  seed: CnipaKnowledgeDocumentSeedV1,
  evidence: readonly CnipaDetailEvidenceEntryV1[],
): string {
  const base = seed.markdownBody.replace(/\s+$/u, "");
  const lines = evidence.map((entry) => `- \`${entry.path}\`: ${markdownValue(entry.value)}`);
  return `${base}\n\n## CNIPA DETAIL enrichment\n\n${lines.join("\n")}\n`;
}

export function enrichCnipaMarkdownFromDetail(input: {
  documentSeed: CnipaKnowledgeDocumentSeedV1;
  listArtifactId: string;
  detailArtifactId: string;
  detailBody: Uint8Array;
}): CnipaDetailMarkdownDecisionV1 {
  const listArtifactId = required(input.listArtifactId, "listArtifactId");
  const detailArtifactId = required(input.detailArtifactId, "detailArtifactId");
  const detail = parseJson(input.detailBody);
  const baseMarkdownSha256 = sha256(input.documentSeed.markdownBody);
  const detailBodySha256 = sha256(input.detailBody);
  const evidence = materialEvidence(input.documentSeed.markdownBody, detail);
  if (evidence.length === 0) {
    return {
      material: false,
      reason: "NO_NEW_DETAIL_EVIDENCE",
      baseMarkdownSha256,
      detailBodySha256,
    };
  }

  const markdownBody = renderEnrichedMarkdown(input.documentSeed, evidence);
  return {
    material: true,
    enrichment: {
      schemaVersion: CNIPA_DETAIL_MARKDOWN_ENRICHMENT_VERSION,
      sourceAuthority: "CNIPA",
      documentKind: input.documentSeed.documentKind,
      sourceRecordId: input.documentSeed.sourceRecordId,
      logicalDocumentUri: input.documentSeed.logicalDocumentUri,
      title: input.documentSeed.title,
      listArtifactId,
      detailArtifactId,
      baseMarkdownSha256,
      detailBodySha256,
      enrichedMarkdownSha256: sha256(markdownBody),
      materialEvidence: evidence,
      markdownBody,
    },
  };
}
