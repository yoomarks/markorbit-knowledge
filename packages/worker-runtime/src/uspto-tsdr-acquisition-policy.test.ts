import { describe, expect, it } from "vitest";
import {
  USPTO_TSDR_API_KEY_HEADER,
  admitUsptoTsdrAcquisition,
  usptoTsdrAcquisitionPolicyDescriptor,
} from "./uspto-tsdr-acquisition-policy";

const SECRET_REF = "sec_01ARZ3NDEKTSV4RRFFQ69G5FAV";

function indexRequest() {
  return {
    intent: "CASE_DOCUMENT_INDEX",
    serialNumber: "78787878",
    secretRef: SECRET_REF,
    requestsPerMinute: 60,
    coverageClaim: "TARGET_SERIAL_ONLY",
    legalEffectClaim: false,
  };
}

function binaryRequest() {
  return {
    intent: "SELECTED_DOCUMENT_BINARY",
    serialNumber: "78787878",
    secretRef: SECRET_REF,
    requestsPerMinute: 4,
    coverageClaim: "TARGET_SERIAL_ONLY",
    legalEffectClaim: false,
    format: "PDF",
    document: {
      sourceIndexArtifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAW",
      sourceDocumentId: "TSDR-DOC-001",
      sourceDocumentType: "OFFICE ACTION",
      sourceDescription: "Non-final Office action",
      family: "OFFICE_ACTION",
      classifierIdentity: "uspto-tsdr-document-family",
      classifierVersion: "1.0.0",
    },
  };
}

describe("USPTO TSDR acquisition policy", () => {
  it("requires the targeted metadata index response to enter immutable raw evidence", () => {
    expect(admitUsptoTsdrAcquisition(indexRequest())).toMatchObject({
      intent: "CASE_DOCUMENT_INDEX",
      serialNumber: "78787878",
      requestBudgetPerMinute: 60,
      artifactAdmission: "IMMUTABLE_INDEX_RESPONSE_REQUIRED",
      apiKeyHeader: USPTO_TSDR_API_KEY_HEADER,
      populationCompleteClaimAllowed: false,
      legalEffectConclusionAllowed: false,
    });
  });

  it("admits one explicitly classified high-value binary as immutable raw evidence", () => {
    expect(admitUsptoTsdrAcquisition(binaryRequest())).toMatchObject({
      intent: "SELECTED_DOCUMENT_BINARY",
      requestBudgetPerMinute: 4,
      artifactAdmission: "IMMUTABLE_RAW_BINARY_REQUIRED",
      format: "PDF",
      document: {
        sourceIndexArtifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAW",
        sourceDocumentId: "TSDR-DOC-001",
        family: "OFFICE_ACTION",
        classifierVersion: "1.0.0",
      },
    });
  });

  it("requires a secret reference and rejects raw credential surfaces", () => {
    expect(() =>
      admitUsptoTsdrAcquisition({
        ...indexRequest(),
        secretRef: "raw-api-key",
      }),
    ).toThrow(expect.objectContaining({ code: "TSDR_SECRET_REFERENCE_REQUIRED" }));
    expect(() =>
      admitUsptoTsdrAcquisition({
        ...indexRequest(),
        apiKey: "do-not-store-this",
      }),
    ).toThrow(expect.objectContaining({ code: "TSDR_REQUEST_INVALID" }));
  });

  it("enforces the separate official metadata and PDF/ZIP request ceilings", () => {
    expect(() => admitUsptoTsdrAcquisition({ ...indexRequest(), requestsPerMinute: 61 })).toThrow(
      expect.objectContaining({ code: "TSDR_RATE_LIMIT_EXCEEDED" }),
    );
    expect(() => admitUsptoTsdrAcquisition({ ...binaryRequest(), requestsPerMinute: 5 })).toThrow(
      expect.objectContaining({ code: "TSDR_RATE_LIMIT_EXCEEDED" }),
    );
  });

  it("rejects malformed serials and bulk or range-shaped additions", () => {
    expect(() => admitUsptoTsdrAcquisition({ ...indexRequest(), serialNumber: "7878" })).toThrow(
      /exactly 8 digits/,
    );
    expect(() =>
      admitUsptoTsdrAcquisition({
        ...indexRequest(),
        serialNumbers: ["78787878", "78787879"],
      }),
    ).toThrow(expect.objectContaining({ code: "TSDR_REQUEST_INVALID" }));
    expect(() => admitUsptoTsdrAcquisition({ ...indexRequest(), fromSerial: "70000000" })).toThrow(
      expect.objectContaining({ code: "TSDR_REQUEST_INVALID" }),
    );
  });

  it("keeps routine and unclassified families metadata-only", () => {
    for (const family of ["APPLICATION_FILING", "SPECIMEN", "OTHER"]) {
      expect(() =>
        admitUsptoTsdrAcquisition({
          ...binaryRequest(),
          document: { ...binaryRequest().document, family },
        }),
      ).toThrow(expect.objectContaining({ code: "TSDR_DOCUMENT_DOWNLOAD_NOT_ADMITTED" }));
    }
    expect(() =>
      admitUsptoTsdrAcquisition({
        ...binaryRequest(),
        document: { ...binaryRequest().document, family: "UNVERIFIED_FAMILY" },
      }),
    ).toThrow(expect.objectContaining({ code: "TSDR_DOCUMENT_CLASSIFICATION_REQUIRED" }));
  });

  it("rejects a binary selection that is not grounded in an immutable index artifact", () => {
    expect(() =>
      admitUsptoTsdrAcquisition({
        ...binaryRequest(),
        document: {
          ...binaryRequest().document,
          sourceIndexArtifactId: "caller-supplied-metadata",
        },
      }),
    ).toThrow(expect.objectContaining({ code: "TSDR_DOCUMENT_CLASSIFICATION_REQUIRED" }));
  });

  it("rejects population completeness and legal-effect authority claims", () => {
    expect(() =>
      admitUsptoTsdrAcquisition({ ...indexRequest(), coverageClaim: "COMPLETE" }),
    ).toThrow(expect.objectContaining({ code: "TSDR_AUTHORITY_CLAIM_FORBIDDEN" }));
    expect(() => admitUsptoTsdrAcquisition({ ...binaryRequest(), legalEffectClaim: true })).toThrow(
      expect.objectContaining({ code: "TSDR_AUTHORITY_CLAIM_FORBIDDEN" }),
    );
  });

  it("publishes an immutable descriptor without claiming a production executor", () => {
    const descriptor = usptoTsdrAcquisitionPolicyDescriptor();
    expect(descriptor).toMatchObject({
      rateLimitsPerApiKeyPerMinute: { metadata: 60, pdfOrZip: 4 },
      populationCompleteClaimAllowed: false,
      legalEffectConclusionAllowed: false,
      productionExecutionImplemented: false,
    });
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(Object.isFrozen(descriptor.highValueDocumentFamilies)).toBe(true);
  });
});
