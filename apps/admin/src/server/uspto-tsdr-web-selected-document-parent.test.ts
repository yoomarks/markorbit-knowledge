import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyUsptoTsdrWebSelectedDocumentParentEvidence } from "./uspto-tsdr-web-selected-document-parent";

const html = `<!doctype html><html><head><script>var DocsList ={"caseId":"sn99047647","caseDocs":[{"docId":"FREF20260722103245","description":"Final Action","displayDate":"Jul. 22, 2026","pageCount":1,"urlPathList":["https://tsdrsec.uspto.gov/ts/cd/tmcasedoc/downloadproxy?url=/api/casedoc/cms/case/99047647/office-action/OfficeAction8740681.pdf"],"mediaTypeList":["application/pdf"]}]}</script></head></html>`;
const bytes = new TextEncoder().encode(html);
const sha256 = createHash("sha256").update(bytes).digest("hex");

function document() {
  return {
    sourceIndexArtifactId: "art_01M2X01M8RS5MNFC953RM7N6Y3",
    sourceIndexArtifactSha256: sha256,
    sourceDocumentId: "FREF20260722103245",
    sourceDocumentType: "Final Action",
    sourceDescription: "Final Action",
    sourceDisplayDate: "Jul. 22, 2026",
    sourcePageCount: 1,
    family: "OFFICE_ACTION" as const,
    classifierIdentity: "uspto-tsdr-document-family" as const,
    classifierVersion: "1.1.0" as const,
    downloadUrl:
      "https://tsdrsec.uspto.gov/ts/cd/tmcasedoc/downloadproxy?url=/api/casedoc/cms/case/99047647/office-action/OfficeAction8740681.pdf",
  };
}

function parent() {
  return {
    workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    sourceId: "src_01M2X01CES1FAEVW3GWCC075J6",
    artifactId: "art_01M2X01M8RS5MNFC953RM7N6Y3",
    artifactKind: "HTML",
    mimeType: "text/html",
    canonicalUri: "https://tsdr.uspto.gov/documentviewer?caseId=sn99047647",
    sha256,
    sizeBytes: bytes.byteLength,
    content: bytes,
  };
}

describe("TSDR Web selected-document parent verifier", () => {
  it("reproduces the selected Final Action from immutable DocsList evidence", () => {
    expect(
      verifyUsptoTsdrWebSelectedDocumentParentEvidence({
        workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        serialNumber: "99047647",
        document: document(),
        parent: parent(),
      }),
    ).toMatchObject({
      sourceId: "src_01M2X01CES1FAEVW3GWCC075J6",
      document: {
        sourceDocumentId: "FREF20260722103245",
        family: "OFFICE_ACTION",
        classifierVersion: "1.1.0",
      },
    });
  });

  it("fails closed when parent bytes no longer match the frozen digest", () => {
    expect(() =>
      verifyUsptoTsdrWebSelectedDocumentParentEvidence({
        workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        serialNumber: "99047647",
        document: document(),
        parent: { ...parent(), content: new TextEncoder().encode(html + "tampered") },
      }),
    ).toThrow(/identity mismatch/u);
  });

  it("fails closed when the caller swaps the selected PDF URL", () => {
    expect(() =>
      verifyUsptoTsdrWebSelectedDocumentParentEvidence({
        workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        serialNumber: "99047647",
        document: {
          ...document(),
          downloadUrl:
            "https://tsdrsec.uspto.gov/ts/cd/tmcasedoc/downloadproxy?url=/api/casedoc/cms/case/99047647/office-action/OfficeAction9999999.pdf",
        },
        parent: parent(),
      }),
    ).toThrow(/does not reproduce/u);
  });
});
