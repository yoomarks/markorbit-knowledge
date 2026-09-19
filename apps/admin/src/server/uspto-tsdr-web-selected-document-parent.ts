import { createHash } from "node:crypto";
import {
  normalizeUsptoTsdrWebSelectedDocumentSelection,
  type UsptoTsdrWebSelectedDocumentSelection,
} from "@markorbit/worker-runtime";

export type UsptoTsdrWebSelectedParentEvidence = {
  workspaceId: string;
  sourceId: string;
  artifactId: string;
  artifactKind: string;
  mimeType: string;
  canonicalUri: string | null;
  sha256: string;
  sizeBytes: number;
  content: Uint8Array;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be a string array`);
  }
  return value as string[];
}

function parseDocsList(content: Uint8Array): Record<string, unknown> {
  const html = new TextDecoder("utf-8", { fatal: true }).decode(content);
  const marker = "var DocsList =";
  const start = html.indexOf(marker);
  if (start < 0) throw new Error("TSDR document index does not contain DocsList");
  const jsonStart = start + marker.length;
  const end = html.indexOf("</script>", jsonStart);
  if (end < 0) throw new Error("TSDR document index DocsList script is unterminated");
  const raw = html.slice(jsonStart, end).trim().replace(/;$/u, "");
  return record(JSON.parse(raw) as unknown, "DocsList");
}

export function verifyUsptoTsdrWebSelectedDocumentParentEvidence(input: {
  workspaceId: string;
  serialNumber: string;
  document: UsptoTsdrWebSelectedDocumentSelection;
  parent: UsptoTsdrWebSelectedParentEvidence;
}): { sourceId: string; document: UsptoTsdrWebSelectedDocumentSelection } {
  const document = normalizeUsptoTsdrWebSelectedDocumentSelection(
    input.serialNumber,
    input.document,
  );
  const parent = input.parent;
  if (
    parent.workspaceId !== input.workspaceId ||
    parent.artifactId !== document.sourceIndexArtifactId ||
    parent.artifactKind !== "HTML" ||
    !["text/html", "application/xhtml+xml"].includes(parent.mimeType) ||
    parent.canonicalUri !== `https://tsdr.uspto.gov/documentviewer?caseId=sn${input.serialNumber}`
  ) {
    throw new Error("Selected document parent RawArtifact boundary mismatch");
  }
  if (
    parent.sha256 !== document.sourceIndexArtifactSha256 ||
    parent.content.byteLength !== parent.sizeBytes ||
    createHash("sha256").update(parent.content).digest("hex") !== document.sourceIndexArtifactSha256
  ) {
    throw new Error("Selected document parent RawArtifact identity mismatch");
  }

  const docsList = parseDocsList(parent.content);
  if (docsList.caseId !== `sn${input.serialNumber}`) {
    throw new Error("Selected document parent DocsList caseId mismatch");
  }
  if (!Array.isArray(docsList.caseDocs)) {
    throw new Error("Selected document parent DocsList caseDocs is missing");
  }
  const matches = docsList.caseDocs
    .map((value, index) => ({ value: record(value, `DocsList.caseDocs[${index}]`), index }))
    .filter(({ value }) => value.docId === document.sourceDocumentId);
  if (matches.length !== 1) {
    throw new Error("Selected document id must appear exactly once in parent DocsList");
  }
  const selected = matches[0]!.value;
  if (
    selected.description !== document.sourceDescription ||
    selected.description !== document.sourceDocumentType ||
    selected.displayDate !== document.sourceDisplayDate ||
    selected.pageCount !== document.sourcePageCount
  ) {
    throw new Error("Selected document metadata does not reproduce from parent DocsList");
  }
  const urls = stringArray(selected.urlPathList, "selected urlPathList");
  const media = stringArray(selected.mediaTypeList, "selected mediaTypeList");
  const urlIndex = urls.indexOf(document.downloadUrl);
  if (urlIndex < 0 || media[urlIndex] !== "application/pdf") {
    throw new Error("Selected PDF URL does not reproduce from parent DocsList");
  }
  return { sourceId: parent.sourceId, document };
}
