import { describe, expect, it } from "vitest";
import {
  USPTO_TSDR_DOCUMENT_CLASSIFIER_IDENTITY,
  USPTO_TSDR_DOCUMENT_CLASSIFIER_VERSION,
  classifyUsptoTsdrDocument,
  usptoTsdrDocumentClassifierDescriptor,
} from "./uspto-tsdr-document-classifier";

describe("USPTO TSDR document classifier", () => {
  it.each([
    ["Non-final Office Action", "", "OFFICE_ACTION"],
    ["Response to Office Action", "", "APPLICANT_RESPONSE"],
    ["", "Notice of Allowance", "NEXT_ACTION_NOTICE"],
    ["Notice of Abandonment", "", "OUTCOME_DOCUMENT"],
    ["Registration Certificate", "", "REGISTRATION_CERTIFICATE"],
    ["", "Post-Registration Office Action", "POST_REGISTRATION_ACTION"],
    ["Decision on Petition", "", "PETITION_DECISION"],
    ["Specimen of Use", "", "SPECIMEN"],
  ])("classifies exact normalized metadata %s / %s", (type, description, family) => {
    const result = classifyUsptoTsdrDocument({
      sourceDocumentType: type,
      sourceDescription: description,
    });

    expect(result).toMatchObject({
      classifierIdentity: USPTO_TSDR_DOCUMENT_CLASSIFIER_IDENTITY,
      classifierVersion: USPTO_TSDR_DOCUMENT_CLASSIFIER_VERSION,
      status: "CLASSIFIED",
      family,
    });
    expect(result.matchedRuleIds).toHaveLength(1);
    expect(result.metadataFingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("normalizes Unicode, punctuation, case, and whitespace deterministically", () => {
    const left = classifyUsptoTsdrDocument({
      sourceDocumentType: "  NON‑FINAL   OFFICE ACTION ",
      sourceDescription: "",
    });
    const right = classifyUsptoTsdrDocument({
      sourceDocumentType: "non-final office action",
      sourceDescription: "",
    });

    expect(left.family).toBe("OFFICE_ACTION");
    expect(left.metadataFingerprintSha256).toBe(right.metadataFingerprintSha256);
  });

  it("returns UNCLASSIFIED for unknown source metadata instead of guessing", () => {
    expect(
      classifyUsptoTsdrDocument({
        sourceDocumentType: "Incoming",
        sourceDescription: "Miscellaneous submission",
      }),
    ).toMatchObject({ status: "UNCLASSIFIED", family: null, matchedRuleIds: [] });
  });

  it("returns AMBIGUOUS when official type and description resolve to different families", () => {
    expect(
      classifyUsptoTsdrDocument({
        sourceDocumentType: "Final Office Action",
        sourceDescription: "Response to Office Action",
      }),
    ).toMatchObject({
      status: "AMBIGUOUS",
      family: null,
      matchedRuleIds: ["applicant-response-explicit-v1", "office-action-explicit-v1"],
    });
  });

  it("publishes a frozen, auditable phrase registry", () => {
    const descriptor = usptoTsdrDocumentClassifierDescriptor();

    expect(descriptor).toMatchObject({
      identity: USPTO_TSDR_DOCUMENT_CLASSIFIER_IDENTITY,
      version: USPTO_TSDR_DOCUMENT_CLASSIFIER_VERSION,
      matchSemantics: "EXACT_NORMALIZED_SOURCE_FIELD_VALUE",
      ambiguityBehavior: "FAIL_CLOSED",
      unknownBehavior: "UNCLASSIFIED",
    });
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(Object.isFrozen(descriptor.rules)).toBe(true);
  });
});
