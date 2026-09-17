import { createHash } from "node:crypto";
import type { UsptoTsdrDocumentFamily } from "./uspto-tsdr-acquisition-policy";

export const USPTO_TSDR_DOCUMENT_CLASSIFIER_IDENTITY = "uspto-tsdr-document-family" as const;
export const USPTO_TSDR_DOCUMENT_CLASSIFIER_VERSION = "1.0.0" as const;

export type UsptoTsdrDocumentMetadata = {
  sourceDocumentType: string;
  sourceDescription: string;
};

export type UsptoTsdrDocumentClassification = {
  classifierIdentity: typeof USPTO_TSDR_DOCUMENT_CLASSIFIER_IDENTITY;
  classifierVersion: typeof USPTO_TSDR_DOCUMENT_CLASSIFIER_VERSION;
  metadataFingerprintSha256: string;
  normalizedSourceDocumentType: string;
  normalizedSourceDescription: string;
  status: "CLASSIFIED" | "UNCLASSIFIED" | "AMBIGUOUS";
  family: UsptoTsdrDocumentFamily | null;
  matchedRuleIds: readonly string[];
};

type ClassificationRule = {
  id: string;
  family: Exclude<UsptoTsdrDocumentFamily, "OTHER">;
  exactMetadataValues: readonly string[];
};

const RULES: readonly ClassificationRule[] = Object.freeze([
  {
    id: "office-action-explicit-v1",
    family: "OFFICE_ACTION",
    exactMetadataValues: ["office action", "non final office action", "final office action"],
  },
  {
    id: "applicant-response-explicit-v1",
    family: "APPLICANT_RESPONSE",
    exactMetadataValues: [
      "response to office action",
      "response to suspension inquiry",
      "request for reconsideration after final action",
    ],
  },
  {
    id: "next-action-notice-explicit-v1",
    family: "NEXT_ACTION_NOTICE",
    exactMetadataValues: ["notice of allowance", "notice of publication", "suspension inquiry"],
  },
  {
    id: "outcome-document-explicit-v1",
    family: "OUTCOME_DOCUMENT",
    exactMetadataValues: ["notice of abandonment", "abandonment notice"],
  },
  {
    id: "registration-certificate-explicit-v1",
    family: "REGISTRATION_CERTIFICATE",
    exactMetadataValues: ["registration certificate", "certificate of registration"],
  },
  {
    id: "post-registration-action-explicit-v1",
    family: "POST_REGISTRATION_ACTION",
    exactMetadataValues: ["post registration office action", "post registration action"],
  },
  {
    id: "petition-decision-explicit-v1",
    family: "PETITION_DECISION",
    exactMetadataValues: ["petition decision", "decision on petition"],
  },
  {
    id: "application-filing-explicit-v1",
    family: "APPLICATION_FILING",
    exactMetadataValues: ["application filing", "new application"],
  },
  {
    id: "specimen-explicit-v1",
    family: "SPECIMEN",
    exactMetadataValues: ["specimen", "specimen of use"],
  },
  {
    id: "routine-correspondence-explicit-v1",
    family: "ROUTINE_CORRESPONDENCE",
    exactMetadataValues: ["routine correspondence", "correspondence"],
  },
]);

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function fingerprint(sourceDocumentType: string, sourceDescription: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ sourceDocumentType, sourceDescription }))
    .digest("hex");
}

export function classifyUsptoTsdrDocument(
  metadata: UsptoTsdrDocumentMetadata,
): UsptoTsdrDocumentClassification {
  const normalizedSourceDocumentType = normalize(metadata.sourceDocumentType);
  const normalizedSourceDescription = normalize(metadata.sourceDescription);
  const values = new Set([normalizedSourceDocumentType, normalizedSourceDescription]);
  const matched = RULES.filter((rule) =>
    rule.exactMetadataValues.some((candidate) => values.has(candidate)),
  );
  const families = new Set(matched.map((rule) => rule.family));
  const status =
    families.size === 0 ? "UNCLASSIFIED" : families.size === 1 ? "CLASSIFIED" : "AMBIGUOUS";
  return Object.freeze({
    classifierIdentity: USPTO_TSDR_DOCUMENT_CLASSIFIER_IDENTITY,
    classifierVersion: USPTO_TSDR_DOCUMENT_CLASSIFIER_VERSION,
    metadataFingerprintSha256: fingerprint(
      normalizedSourceDocumentType,
      normalizedSourceDescription,
    ),
    normalizedSourceDocumentType,
    normalizedSourceDescription,
    status,
    family: status === "CLASSIFIED" ? [...families][0]! : null,
    matchedRuleIds: Object.freeze(matched.map((rule) => rule.id).sort()),
  });
}

export function usptoTsdrDocumentClassifierDescriptor() {
  return Object.freeze({
    identity: USPTO_TSDR_DOCUMENT_CLASSIFIER_IDENTITY,
    version: USPTO_TSDR_DOCUMENT_CLASSIFIER_VERSION,
    matchSemantics: "EXACT_NORMALIZED_SOURCE_FIELD_VALUE" as const,
    ambiguityBehavior: "FAIL_CLOSED" as const,
    unknownBehavior: "UNCLASSIFIED" as const,
    rules: Object.freeze(
      RULES.map((rule) =>
        Object.freeze({
          id: rule.id,
          family: rule.family,
          exactMetadataValues: Object.freeze([...rule.exactMetadataValues]),
        }),
      ),
    ),
  });
}
