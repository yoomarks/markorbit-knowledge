import { createHash } from "node:crypto";

import type { AcquiredCollectionArtifact } from "./artifact-backed-collection-executor";
import {
  buildCnipaGazetteCheckpoint,
  planCnipaGazettePageRanges,
  type CnipaGazetteCheckpoint,
  type CnipaGazettePageRange,
} from "./cnipa-gazette-checkpoint-runtime";
import {
  CNIPA_GAZETTE_CHECKPOINT_ARTIFACT_SCHEMA,
  CNIPA_GAZETTE_DEFAULT_PAGES_PER_CHECKPOINT,
} from "./cnipa-gazette-checkpoint-acquirer";
import {
  CNIPA_GAZETTE_BROWSER_DATASET_IDENTITY_SCHEMA,
  materializeCnipaGazetteDatasetIdentity,
  type CnipaGazetteBrowserDatasetIdentityV2,
  type CnipaGazetteDatasetIdentityEnvelope,
} from "./cnipa-gazette-data-engine-handoff";
import {
  cnipaGazetteBrowserStreamSessionFingerprint,
  parseCnipaGazetteBrowserSourcePage,
  parseCnipaGazetteBrowserStreamState,
  type CnipaGazetteBrowserLogicalPage,
  type CnipaGazetteBrowserSourcePage,
  type CnipaGazetteBrowserStreamSession,
  type CnipaGazetteBrowserStreamState,
} from "./cnipa-gazette-browser-stream";

export const CNIPA_GAZETTE_BROWSER_SOURCE_PAGE_EVIDENCE_SCHEMA =
  "CNIPA_GAZETTE_BROWSER_SOURCE_PAGE_EVIDENCE_V1" as const;
export const CNIPA_GAZETTE_BROWSER_LOGICAL_PAGE_EVIDENCE_SCHEMA =
  "CNIPA_GAZETTE_BROWSER_LOGICAL_PAGE_EVIDENCE_V1" as const;
export const CNIPA_GAZETTE_BROWSER_STREAM_STATE_ARTIFACT_SCHEMA =
  "CNIPA_GAZETTE_BROWSER_STREAM_STATE_ARTIFACT_V1" as const;

export type CnipaGazetteBrowserSourcePageEvidence = {
  page: CnipaGazetteBrowserSourcePage;
  rawArtifact: AcquiredCollectionArtifact;
  projectionArtifact: AcquiredCollectionArtifact;
};

export type CnipaGazetteBrowserLogicalPageEvidence = {
  page: CnipaGazetteBrowserLogicalPage;
  projectionArtifact: AcquiredCollectionArtifact;
};

export type CnipaGazetteBrowserCheckpointEvidence = {
  checkpoint: CnipaGazetteCheckpoint;
  checkpointArtifact: AcquiredCollectionArtifact;
  logicalPageProjectionArtifacts: readonly AcquiredCollectionArtifact[];
  plannedRanges: readonly CnipaGazettePageRange[];
};

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseJsonBytes(bytes: Uint8Array): unknown {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new TypeError("browser source raw body must be non-empty bytes");
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new TypeError("browser source raw body must contain valid UTF-8 JSON");
  }
}

function sourcePageBase(
  session: CnipaGazetteBrowserStreamSession,
  sourcePageIndex: number,
): string {
  return (
    `cnipa://trademark-gazette/issue/${session.announcementIssue}` +
    `/browser-source/page-size/${session.sourcePageSize}/page/${sourcePageIndex}`
  );
}

function logicalPageBase(
  session: CnipaGazetteBrowserStreamSession,
  logicalPageIndex: number,
): string {
  return `cnipa://trademark-gazette/issue/${session.announcementIssue}/list/page/${logicalPageIndex}`;
}

function sourceProjectionUri(
  session: CnipaGazetteBrowserStreamSession,
  sourcePageIndex: number,
): string {
  return `${sourcePageBase(session, sourcePageIndex)}/projection`;
}
function sourceRequestBody(
  session: CnipaGazetteBrowserStreamSession,
  sourcePageIndex: number,
): Readonly<Record<string, string | number>> {
  return {
    ...session.capturedQuery,
    pageIndex: sourcePageIndex,
    pageSize: session.sourcePageSize,
  };
}

export function buildCnipaGazetteBrowserSourcePageEvidence(input: {
  session: CnipaGazetteBrowserStreamSession;
  requestedPageIndex: number;
  observedAt: string;
  httpStatus: number;
  rawBody: Uint8Array;
  contentType?: string;
}): CnipaGazetteBrowserSourcePageEvidence {
  const payload = parseJsonBytes(input.rawBody);
  const page = parseCnipaGazetteBrowserSourcePage({
    session: input.session,
    requestedPageIndex: input.requestedPageIndex,
    observedAt: input.observedAt,
    httpStatus: input.httpStatus,
    payload,
  });
  const base = sourcePageBase(input.session, page.sourcePageIndex);
  const rawCanonicalUri = `${base}/raw`;
  const projectionCanonicalUri = `${base}/projection`;
  const rawArtifact: AcquiredCollectionArtifact = {
    artifactKind: "JSON",
    mimeType: input.contentType?.trim() || "application/json;charset=UTF-8",
    originalName:
      `cnipa-gazette-issue-${input.session.announcementIssue}` +
      `-browser-source-p${page.sourcePageIndex}-s${page.sourcePageSize}.json`,
    sourceUri: input.session.sourceUrl,
    canonicalUri: rawCanonicalUri,
    content: input.rawBody,
  };

  const projectionArtifact: AcquiredCollectionArtifact = {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName:
      `cnipa-gazette-issue-${input.session.announcementIssue}` +
      `-browser-source-p${page.sourcePageIndex}-projection.json`,
    sourceUri: input.session.sourceUrl,
    canonicalUri: projectionCanonicalUri,
    parentCanonicalUris: [rawCanonicalUri],
    content: jsonBytes({
      schemaVersion: CNIPA_GAZETTE_BROWSER_SOURCE_PAGE_EVIDENCE_SCHEMA,
      sourceOwner: "MARKORBIT_KNOWLEDGE",
      sourceFamily: "CNIPA_TRADEMARK_GAZETTE",
      acquisitionMode: "NORMAL_BROWSER_STREAM",
      sessionFingerprintSha256: cnipaGazetteBrowserStreamSessionFingerprint(input.session),
      announcementIssue: input.session.announcementIssue,
      observedAt: page.observedAt,
      request: {
        method: "POST",
        path: new URL(input.session.sourceUrl).pathname,
        body: sourceRequestBody(input.session, page.sourcePageIndex),
      },
      sourceRawCanonicalUri: rawCanonicalUri,
      sourcePage: page,
    }),
  };

  return { page, rawArtifact, projectionArtifact };
}

export function buildCnipaGazetteBrowserStreamStateArtifact(input: {
  session: CnipaGazetteBrowserStreamSession;
  state: CnipaGazetteBrowserStreamState;
  observedAt: string;
}): AcquiredCollectionArtifact {
  const state = parseCnipaGazetteBrowserStreamState(input.state, input.session);
  if (Number.isNaN(Date.parse(input.observedAt))) {
    throw new TypeError("state artifact observedAt must be ISO-8601");
  }
  const fingerprint = cnipaGazetteBrowserStreamSessionFingerprint(input.session);
  const acceptedSourcePage = state.nextSourcePageIndex - 1;
  const parentCanonicalUris =
    acceptedSourcePage > 0 ? [sourceProjectionUri(input.session, acceptedSourcePage)] : [];
  return {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName:
      `cnipa-gazette-issue-${input.session.announcementIssue}` +
      `-browser-stream-state-${fingerprint.slice(0, 12)}.json`,
    sourceUri: input.session.sourceUrl,
    canonicalUri:
      `cnipa://trademark-gazette/issue/${input.session.announcementIssue}` +
      `/browser-stream/${fingerprint}/state`,
    ...(parentCanonicalUris.length > 0 ? { parentCanonicalUris } : {}),
    content: jsonBytes({
      schemaVersion: CNIPA_GAZETTE_BROWSER_STREAM_STATE_ARTIFACT_SCHEMA,
      sourceOwner: "MARKORBIT_KNOWLEDGE",
      sourceFamily: "CNIPA_TRADEMARK_GAZETTE",
      acquisitionMode: "NORMAL_BROWSER_STREAM",
      observedAt: input.observedAt,
      session: input.session,
      state,
    }),
  };
}
export function buildCnipaGazetteBrowserLogicalPageEvidence(input: {
  session: CnipaGazetteBrowserStreamSession;
  page: CnipaGazetteBrowserLogicalPage;
}): CnipaGazetteBrowserLogicalPageEvidence {
  const page = input.page;
  if (
    page.pageSize !== 100 ||
    page.sourceTotal !== input.session.sourceTotal ||
    page.announcementDate !== input.session.announcementDate ||
    page.sourcePageIndices.length === 0
  ) {
    throw new TypeError("logical page does not match the browser-stream session");
  }
  const expectedLogicalPages = Math.max(1, Math.ceil(input.session.sourceTotal / 100));
  if (page.sourcePages !== expectedLogicalPages) {
    throw new TypeError("logical page count does not match the normalized dataset");
  }
  if (
    page.sourcePageIndices.some(
      (sourcePageIndex) =>
        !Number.isSafeInteger(sourcePageIndex) ||
        sourcePageIndex < 1 ||
        sourcePageIndex > input.session.sourcePages,
    )
  ) {
    throw new TypeError("logical page source provenance contains an invalid source page");
  }
  const base = logicalPageBase(input.session, page.pageIndex);
  const parentCanonicalUris = page.sourcePageIndices
    .map((sourcePageIndex) => sourceProjectionUri(input.session, sourcePageIndex))
    .sort();
  const projectionArtifact: AcquiredCollectionArtifact = {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName:
      `cnipa-gazette-issue-${input.session.announcementIssue}` +
      `-logical-page-${page.pageIndex}-projection.json`,
    sourceUri: input.session.sourceUrl,
    canonicalUri: `${base}/projection`,
    parentCanonicalUris,
    content: jsonBytes({
      schemaVersion: CNIPA_GAZETTE_BROWSER_LOGICAL_PAGE_EVIDENCE_SCHEMA,
      sourceOwner: "MARKORBIT_KNOWLEDGE",
      sourceFamily: "CNIPA_TRADEMARK_GAZETTE",
      acquisitionMode: "NORMAL_BROWSER_STREAM",
      sessionFingerprintSha256: cnipaGazetteBrowserStreamSessionFingerprint(input.session),
      observedAt: page.observedAt,
      sourcePageIndices: page.sourcePageIndices,
      page: {
        pageIndex: page.pageIndex,
        pageSize: page.pageSize,
        sourceTotal: page.sourceTotal,
        sourcePages: page.sourcePages,
        announcementDate: page.announcementDate,
        rows: page.rows,
      },
    }),
  };
  return { page, projectionArtifact };
}

export function buildCnipaGazetteBrowserCheckpointEvidence(input: {
  session: CnipaGazetteBrowserStreamSession;
  range: CnipaGazettePageRange;
  logicalPages: readonly CnipaGazetteBrowserLogicalPage[];
  pagesPerCheckpoint?: number;
}): CnipaGazetteBrowserCheckpointEvidence {
  const checkpoint = buildCnipaGazetteCheckpoint({
    announcementIssue: input.session.announcementIssue,
    range: input.range,
    pages: input.logicalPages,
  });
  if (
    checkpoint.sourceTotal !== input.session.sourceTotal ||
    checkpoint.announcementDate !== input.session.announcementDate
  ) {
    throw new TypeError("checkpoint does not match the browser-stream session");
  }
  const expectedLogicalPages = Math.max(1, Math.ceil(input.session.sourceTotal / 100));
  if (checkpoint.sourcePages !== expectedLogicalPages) {
    throw new TypeError("checkpoint logical page count does not match the normalized dataset");
  }

  const plannedRanges = planCnipaGazettePageRanges({
    sourcePages: checkpoint.sourcePages,
    pagesPerCheckpoint: input.pagesPerCheckpoint ?? CNIPA_GAZETTE_DEFAULT_PAGES_PER_CHECKPOINT,
  });
  const logicalPageProjectionArtifacts = input.logicalPages.map(
    (page) =>
      buildCnipaGazetteBrowserLogicalPageEvidence({
        session: input.session,
        page,
      }).projectionArtifact,
  );
  const checkpointCanonicalUri =
    `cnipa://trademark-gazette/issue/${input.session.announcementIssue}` +
    `/checkpoint/${input.range.startPage}-${input.range.endPage}`;
  const checkpointArtifact: AcquiredCollectionArtifact = {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName:
      `cnipa-gazette-issue-${input.session.announcementIssue}` +
      `-checkpoint-${input.range.startPage}-${input.range.endPage}.json`,
    sourceUri: input.session.sourceUrl,
    canonicalUri: checkpointCanonicalUri,
    parentCanonicalUris: logicalPageProjectionArtifacts
      .map((artifact) => artifact.canonicalUri)
      .filter((value): value is string => Boolean(value))
      .sort(),
    content: jsonBytes({
      schemaVersion: CNIPA_GAZETTE_CHECKPOINT_ARTIFACT_SCHEMA,
      sourceOwner: "MARKORBIT_KNOWLEDGE",
      sourceFamily: "CNIPA_TRADEMARK_GAZETTE",
      acquisitionMode: "NORMAL_BROWSER_STREAM",
      browserStream: {
        sessionFingerprintSha256: cnipaGazetteBrowserStreamSessionFingerprint(input.session),
        sourcePageSize: input.session.sourcePageSize,
      },
      queryScope: {
        announcementTypeSelection: "ALL",
        anncType: "",
      },
      announcementIssue: input.session.announcementIssue,
      sourceTotal: checkpoint.sourceTotal,
      sourcePages: checkpoint.sourcePages,
      announcementDate: checkpoint.announcementDate,
      pageSize: 100,
      range: input.range,
      checkpoint,
      plannedRanges,
    }),
  };

  return {
    checkpoint,
    checkpointArtifact,
    logicalPageProjectionArtifacts,
    plannedRanges,
  };
}
export function buildCnipaGazetteBrowserDatasetIdentity(input: {
  session: CnipaGazetteBrowserStreamSession;
  firstCheckpoint: CnipaGazetteBrowserCheckpointEvidence;
  firstSourcePageEvidence: CnipaGazetteBrowserSourcePageEvidence;
}): CnipaGazetteDatasetIdentityEnvelope {
  const checkpoint = input.firstCheckpoint.checkpoint;
  const sourcePage = input.firstSourcePageEvidence.page;
  if (checkpoint.range.startPage !== 1) {
    throw new TypeError("browser dataset identity requires the first logical checkpoint");
  }
  if (
    sourcePage.sourcePageIndex !== 1 ||
    sourcePage.sessionId !== input.session.sessionId ||
    sourcePage.sourcePageSize !== input.session.sourcePageSize ||
    sourcePage.sourceTotal !== input.session.sourceTotal ||
    sourcePage.sourcePages !== input.session.sourcePages
  ) {
    throw new TypeError("browser dataset identity requires source page 1 from the same session");
  }
  if (
    checkpoint.announcementIssue !== input.session.announcementIssue ||
    checkpoint.announcementDate !== input.session.announcementDate ||
    checkpoint.sourceTotal !== input.session.sourceTotal
  ) {
    throw new TypeError("browser dataset identity checkpoint does not match the session");
  }

  if (input.session.announcementDate === null) {
    throw new TypeError("browser dataset identity requires a non-empty announcement date");
  }
  const expectedRawCanonical = `${sourcePageBase(input.session, 1)}/raw`;
  if (
    input.firstSourcePageEvidence.rawArtifact.canonicalUri !== expectedRawCanonical ||
    input.firstSourcePageEvidence.rawArtifact.sourceUri !== input.session.sourceUrl
  ) {
    throw new TypeError("browser dataset identity source-page raw artifact is invalid");
  }

  const identity: CnipaGazetteBrowserDatasetIdentityV2 = {
    schemaVersion: CNIPA_GAZETTE_BROWSER_DATASET_IDENTITY_SCHEMA,
    sourceAuthority: "CNIPA",
    sourceFamily: "CNIPA_TRADEMARK_GAZETTE",
    queryScope: {
      announcementTypeSelection: "ALL",
      anncType: "",
    },
    announcementIssue: input.session.announcementIssue,
    announcementDate: input.session.announcementDate!,
    sourceRecordCount: input.session.sourceTotal,
    sourcePageCount: checkpoint.sourcePages,
    pageSize: 100,
    sourceUri: input.session.sourceUrl,
    captureStartedAt: sourcePage.observedAt,
    acquisitionMode: "NORMAL_BROWSER_STREAM",
    sourceCapturePageSize: input.session.sourcePageSize,
    sourceCapturePageCount: input.session.sourcePages,
    captureRootRawSha256: sha256Bytes(input.firstSourcePageEvidence.rawArtifact.content),
  };

  return materializeCnipaGazetteDatasetIdentity({
    identity,
    parentCanonicalUris: [
      input.firstSourcePageEvidence.rawArtifact.canonicalUri,
      input.firstCheckpoint.checkpointArtifact.canonicalUri,
    ].filter((value): value is string => Boolean(value)),
  });
}
