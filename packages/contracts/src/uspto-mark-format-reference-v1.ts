export const USPTO_MARK_FORMAT_REFERENCE_PROTOCOL_VERSION = "1.0" as const;
export const USPTO_MARK_FORMAT_REFERENCE_PROFILE_ID = "uspto-mark-format-reference-v1" as const;

export const USPTO_MARK_FORMAT_SOURCE_KEYS = ["DRAWINGS_AND_SPECIMENS", "MARK_DRAWINGS"] as const;
export type UsptoMarkFormatSourceKey = (typeof USPTO_MARK_FORMAT_SOURCE_KEYS)[number];

export const USPTO_MARK_FORMAT_CURRENTNESS_STATES = [
  "CURRENT",
  "STALE",
  "DRIFT",
  "UNVERIFIED",
] as const;
export type UsptoMarkFormatCurrentnessState = (typeof USPTO_MARK_FORMAT_CURRENTNESS_STATES)[number];

const SHA256 = /^[a-f0-9]{64}$/u;

export const USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1 = {
  protocolVersion: USPTO_MARK_FORMAT_REFERENCE_PROTOCOL_VERSION,
  objectType: "USPTO_MARK_FORMAT_REFERENCE_PROFILE",
  profileId: USPTO_MARK_FORMAT_REFERENCE_PROFILE_ID,
  jurisdiction: "US",
  authority: {
    owner: "United States Patent and Trademark Office",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
  },
  scope: {
    dimension: "MARK_FORMAT_PROTECTION_ARCHITECTURE",
    sourceEvidenceOnly: true,
    factIds: [
      "DRAWING_REQUIRED",
      "STANDARD_AND_SPECIAL_ARE_DISTINCT",
      "STANDARD_CHARACTER_TEXT_ONLY",
      "SPECIAL_FORM_STYLIZED_DESIGN_COLOR",
      "DRAWING_TYPE_AFFECTS_PROTECTION",
      "ONE_MARK_VARIATION_PER_APPLICATION",
    ],
  },
  sources: [
    {
      sourceKey: "DRAWINGS_AND_SPECIMENS",
      sourceVersion: "2023-11-30",
      canonicalUri: "https://www.uspto.gov/trademarks/basics/drawings-and-specimens",
      expectedLastUpdatedDate: "2023-11-30",
      requiredAnchors: [
        "drawing can show your trademark in either standard characters or special form",
        "standard character drawings are text only",
        "special form drawings are stylized",
        "type of drawing you select affects the kind of protection",
        "application is limited to one trademark",
      ],
      locatorQuery: "drawing standard characters special form",
      evidenceQueries: [
        {
          factId: "DRAWING_REQUIRED",
          queryText: "application includes a drawing depicting the mark",
          passageAnchor:
            "your application must include a depiction of the trademark you want to register",
        },
        {
          factId: "STANDARD_AND_SPECIAL_ARE_DISTINCT",
          queryText: "standard character and special form are distinct drawing formats",
          passageAnchor:
            "a drawing can show your trademark in either standard characters or special form",
        },
        {
          factId: "ONE_MARK_VARIATION_PER_APPLICATION",
          queryText: "one application is limited to one mark variation",
          passageAnchor: "an application is limited to one trademark",
        },
      ],
    },
    {
      sourceKey: "MARK_DRAWINGS",
      sourceVersion: "2025-01-18",
      canonicalUri: "https://www.uspto.gov/trademarks/basics/mark-drawings-trademarks",
      expectedLastUpdatedDate: "2025-01-18",
      requiredAnchors: [
        "two types of drawings",
        "standard character drawing shows a trademark in text only",
        "special form drawing shows a trademark with stylization",
        "protection provided by a standard character vs. special form drawing",
        "when is a special form drawing required",
      ],
      locatorQuery: "standard character drawing special form drawing",
      evidenceQueries: [
        {
          factId: "STANDARD_CHARACTER_TEXT_ONLY",
          queryText:
            "standard character drawing is text only without a particular font style size or color",
          passageAnchor: "standard character drawing shows a trademark in text only",
        },
        {
          factId: "SPECIAL_FORM_STYLIZED_DESIGN_COLOR",
          queryText: "special form drawing covers stylization design graphics logos or color",
          passageAnchor: "special form drawing shows a trademark with stylization",
        },
        {
          factId: "DRAWING_TYPE_AFFECTS_PROTECTION",
          queryText: "drawing type affects protection for standard character versus special form",
          passageAnchor:
            "if you register your trademark in special form, your trademark will be protected only for the particular depiction you provided",
        },
      ],
    },
  ],
  tmepCorroboration: {
    currentAlias:
      "https://tmep.uspto.gov/RDMS/TMEP/print?href=TMEP-800d1e1103.html&version=current",
    status: "EXCLUDED_UNTIL_VERSION_IDENTITY_PROVEN",
    reason: "CURRENT_ALIAS_IS_MOVING_AND_NOT_A_FROZEN_SOURCE_VERSION",
  },
  lineagePolicy: {
    versionIdentity: "RETRIEVAL_DOCUMENT_CONTENT_SHA256",
    requireRawArtifactId: true,
    requireArtifactVersion: true,
    requireChunkId: true,
    requireChunkContentSha256: true,
    requireIndexedAt: true,
  },
  currentnessPolicy: {
    maxCaptureAgeDays: 31,
    requireCurrentRetrievalDocument: true,
    requireExpectedLastUpdatedDate: true,
    staleBehavior: "FAIL_CLOSED",
    semanticMetadataDriftBehavior: "FAIL_CLOSED",
  },
  transportPolicy: {
    governedPrimary: "CRAWL4AI_BROWSER",
    corroboration: "HTTPS_HTTP",
    agreement: "BOUNDED_ANCHORS",
    disagreementBehavior: "FAIL_CLOSED",
  },
  boundary: {
    forbiddenUses: [
      "LEGAL_CONCLUSION",
      "CUSTOMER_RECOMMENDATION",
      "FILING_AUTHORIZATION",
      "FILING_BASIS_INFERENCE",
      "REGISTRABILITY_INFERENCE",
      "LIKELIHOOD_OF_CONFUSION_INFERENCE",
      "CLASSIFICATION_STRATEGY",
      "DEADLINE_INFERENCE",
      "OFFICIAL_STATUS_INFERENCE",
    ],
  },
} as const;

export type UsptoMarkFormatReferenceProfileV1 = typeof USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1;
export type UsptoMarkFormatFactId =
  (typeof USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1.scope.factIds)[number];

export type UsptoMarkFormatChunkLineageV1 = {
  factId: UsptoMarkFormatFactId;
  queryText: string;
  chunkId: string;
  chunkContentSha256: string;
};

export type UsptoMarkFormatSourceEvidenceV1 = {
  protocolVersion: typeof USPTO_MARK_FORMAT_REFERENCE_PROTOCOL_VERSION;
  objectType: "USPTO_MARK_FORMAT_SOURCE_EVIDENCE";
  profileId: typeof USPTO_MARK_FORMAT_REFERENCE_PROFILE_ID;
  sourceKey: UsptoMarkFormatSourceKey;
  sourceVersion: string;
  canonicalUri: string;
  sourceLastUpdatedDate: string;
  httpLastUpdatedDate: string;
  workspaceId: string;
  sourceId: string;
  documentId: string;
  rawArtifactId: string;
  artifactVersion: number;
  documentContentSha256: string;
  chunks: UsptoMarkFormatChunkLineageV1[];
  capturedAt: string;
  indexedAt: string;
  isCurrent: boolean;
  browserAnchorsMatched: string[];
  httpBodySha256: string;
  httpAnchorsMatched: string[];
};

export type UsptoMarkFormatCurrentnessAssessmentV1 = {
  protocolVersion: typeof USPTO_MARK_FORMAT_REFERENCE_PROTOCOL_VERSION;
  objectType: "USPTO_MARK_FORMAT_CURRENTNESS_ASSESSMENT";
  sourceKey: UsptoMarkFormatSourceKey;
  state: UsptoMarkFormatCurrentnessState;
  reasonCodes: string[];
};
function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function hasAllAnchors(actual: readonly string[], expected: readonly string[]): boolean {
  const normalized = new Set(actual.map((value) => value.trim().toLowerCase()));
  return expected.every((anchor) => normalized.has(anchor.toLowerCase()));
}

export function assessUsptoMarkFormatSourceEvidenceV1(
  evidence: UsptoMarkFormatSourceEvidenceV1,
  now: Date = new Date(),
): UsptoMarkFormatCurrentnessAssessmentV1 {
  const reasonCodes: string[] = [];
  const source = USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1.sources.find(
    (candidate) => candidate.sourceKey === evidence.sourceKey,
  );
  if (
    evidence.protocolVersion !== USPTO_MARK_FORMAT_REFERENCE_PROTOCOL_VERSION ||
    evidence.objectType !== "USPTO_MARK_FORMAT_SOURCE_EVIDENCE" ||
    evidence.profileId !== USPTO_MARK_FORMAT_REFERENCE_PROFILE_ID ||
    !source
  ) {
    reasonCodes.push("PROFILE_IDENTITY_DRIFT");
  }

  if (source) {
    if (evidence.sourceVersion !== source.sourceVersion) reasonCodes.push("SOURCE_VERSION_DRIFT");
    if (evidence.canonicalUri !== source.canonicalUri) reasonCodes.push("SOURCE_URI_DRIFT");
    if (evidence.sourceLastUpdatedDate !== source.expectedLastUpdatedDate) {
      reasonCodes.push("SOURCE_LAST_UPDATED_DRIFT");
    }
    if (evidence.httpLastUpdatedDate !== source.expectedLastUpdatedDate) {
      reasonCodes.push("HTTP_LAST_UPDATED_DRIFT");
    }
    if (!hasAllAnchors(evidence.browserAnchorsMatched, source.requiredAnchors)) {
      reasonCodes.push("BROWSER_ANCHOR_DRIFT");
    }
    if (!hasAllAnchors(evidence.httpAnchorsMatched, source.requiredAnchors)) {
      reasonCodes.push("HTTP_ANCHOR_DRIFT");
    }
    const seenBindings = new Set<string>();
    for (const binding of evidence.chunks) {
      const bindingKey = `${binding.factId}:${binding.chunkId}`;
      if (seenBindings.has(bindingKey)) reasonCodes.push("FACT_BINDING_DUPLICATE");
      seenBindings.add(bindingKey);
    }
    for (const query of source.evidenceQueries) {
      const binding = evidence.chunks.find(
        (chunk) => chunk.factId === query.factId && chunk.queryText === query.queryText,
      );
      if (!binding) reasonCodes.push("FACT_BINDING_MISSING");
    }
  }
  const identityFields = [
    evidence.workspaceId,
    evidence.sourceId,
    evidence.documentId,
    evidence.rawArtifactId,
    evidence.indexedAt,
  ];
  if (identityFields.some((value) => !nonEmpty(value)))
    reasonCodes.push("LINEAGE_IDENTITY_MISSING");
  if (!Number.isSafeInteger(evidence.artifactVersion) || evidence.artifactVersion < 1) {
    reasonCodes.push("ARTIFACT_VERSION_INVALID");
  }
  if (!SHA256.test(evidence.documentContentSha256) || !SHA256.test(evidence.httpBodySha256)) {
    reasonCodes.push("CONTENT_SHA256_INVALID");
  }
  if (
    evidence.chunks.length < 1 ||
    evidence.chunks.some(
      (chunk) => !nonEmpty(chunk.chunkId) || !SHA256.test(chunk.chunkContentSha256),
    )
  ) {
    reasonCodes.push("CHUNK_LINEAGE_INVALID");
  }

  const capturedAt = Date.parse(evidence.capturedAt);
  const nowMs = now.getTime();
  if (!Number.isFinite(capturedAt) || capturedAt > nowMs) {
    reasonCodes.push("CAPTURE_TIME_INVALID");
  } else if (
    nowMs - capturedAt >
    USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1.currentnessPolicy.maxCaptureAgeDays * 86_400_000
  ) {
    reasonCodes.push("CAPTURE_STALE");
  }
  if (!evidence.isCurrent) reasonCodes.push("RETRIEVAL_DOCUMENT_NOT_CURRENT");

  const drift = reasonCodes.some((code) => code.endsWith("_DRIFT"));
  const unverified = reasonCodes.some((code) =>
    [
      "LINEAGE_IDENTITY_MISSING",
      "ARTIFACT_VERSION_INVALID",
      "CONTENT_SHA256_INVALID",
      "CHUNK_LINEAGE_INVALID",
      "FACT_BINDING_MISSING",
      "FACT_BINDING_DUPLICATE",
      "CAPTURE_TIME_INVALID",
    ].includes(code),
  );
  const stale = reasonCodes.some((code) =>
    ["CAPTURE_STALE", "RETRIEVAL_DOCUMENT_NOT_CURRENT"].includes(code),
  );
  const state: UsptoMarkFormatCurrentnessState = drift
    ? "DRIFT"
    : unverified
      ? "UNVERIFIED"
      : stale
        ? "STALE"
        : "CURRENT";
  return {
    protocolVersion: USPTO_MARK_FORMAT_REFERENCE_PROTOCOL_VERSION,
    objectType: "USPTO_MARK_FORMAT_CURRENTNESS_ASSESSMENT",
    sourceKey: evidence.sourceKey,
    state,
    reasonCodes,
  };
}

export function isCurrentUsptoMarkFormatSourceEvidenceV1(
  evidence: UsptoMarkFormatSourceEvidenceV1,
  now?: Date,
): boolean {
  return assessUsptoMarkFormatSourceEvidenceV1(evidence, now).state === "CURRENT";
}
