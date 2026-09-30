import type { AcquiredCollectionArtifact } from "./artifact-backed-collection-executor";
import {
  buildLaosFullIndexPageArtifacts,
  LAOS_FULL_INDEX_CHECKPOINT_SCHEMA,
} from "./laos-wopublish-full-baseline-artifacts";
import {
  LAOS_SOURCE_ID,
  type LaosIndexPage,
  type LaosIndexResume,
} from "./laos-wopublish-source-adapter";
import type { StreamingArtifactWriteResult } from "./streaming-artifact-writer";

export const LAOS_BASELINE_INDEX_CHECKPOINT_SCHEMA =
  "LA_WOPUBLISH_FULL_INDEX_STREAM_CHECKPOINT_V1" as const;
export const LAOS_BASELINE_INDEX_CHECKPOINT_URI =
  "la-dipo://wopublish/trademarks/baseline/index/checkpoint";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const SHA256 = /^[0-9a-f]{64}$/u;

function jsonBytes(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value));
}

export type LaosBaselineIndexCheckpoint = {
  schemaVersion: typeof LAOS_BASELINE_INDEX_CHECKPOINT_SCHEMA;
  sourceId: typeof LAOS_SOURCE_ID;
  sourceTotal: number;
  completedPage: number;
  requiredPages: number;
  committedPageIdsSha256: readonly string[];
  committedUniqueCount: number;
  complete: boolean;
  nextPage: number | null;
  observedAt: string;
  lastPageCheckpointCanonicalUri: string;
  lastPageAdmissionCanonicalUri: string;
};

export type LaosBaselineIndexPageCommit = {
  pageArtifacts: readonly AcquiredCollectionArtifact[];
  checkpointArtifact: AcquiredCollectionArtifact;
  checkpoint: LaosBaselineIndexCheckpoint;
};

export type LaosBaselineIndexStreamWriter = {
  write(artifact: AcquiredCollectionArtifact): Promise<StreamingArtifactWriteResult>;
  retainCanonicalUris(canonicalUris: readonly string[]): void;
};

function requiredCanonical(
  artifacts: readonly AcquiredCollectionArtifact[],
  suffix: string,
): string {
  const value = artifacts.find((artifact) => artifact.canonicalUri?.endsWith(suffix))?.canonicalUri;
  if (!value) throw new TypeError("Lao per-page evidence is missing " + suffix);
  return value;
}
export function buildLaosBaselineIndexPageCommit(input: {
  page: LaosIndexPage;
  committedPageIdsSha256: readonly string[];
  /** Claim-scoped batch writing requires a distinct canonical URI per page. */
  pageScopedCheckpoint?: boolean;
}): LaosBaselineIndexPageCommit {
  const page = input.page;
  const expectedPage = input.committedPageIdsSha256.length + 1;
  if (
    page.page !== expectedPage ||
    input.committedPageIdsSha256.some((value) => !SHA256.test(value))
  ) {
    throw new TypeError("Lao full-index page does not match the durable resume boundary");
  }

  // #911 remains the single contract for page raw/projection/page-checkpoint/V2 request.
  const pageArtifacts = buildLaosFullIndexPageArtifacts(page);
  const pageCheckpointUri = requiredCanonical(pageArtifacts, "/resume-checkpoint");
  const admissionUri = requiredCanonical(pageArtifacts, "/fact-admission-request");
  const committed = [...input.committedPageIdsSha256, page.sourceRecordIdsSha256];
  const requiredPages = Math.ceil(page.total / 50);
  const complete = committed.length === requiredPages;

  const checkpoint: LaosBaselineIndexCheckpoint = {
    schemaVersion: LAOS_BASELINE_INDEX_CHECKPOINT_SCHEMA,
    sourceId: LAOS_SOURCE_ID,
    sourceTotal: page.total,
    completedPage: page.page,
    requiredPages,
    committedPageIdsSha256: Object.freeze(committed),
    committedUniqueCount: Math.min(page.total, committed.length * 50),
    complete,
    nextPage: complete ? null : page.page + 1,
    observedAt: page.observedAt,
    lastPageCheckpointCanonicalUri: pageCheckpointUri,
    lastPageAdmissionCanonicalUri: admissionUri,
  };
  const checkpointArtifact: AcquiredCollectionArtifact = {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName: "la-wopublish-full-index-stream-checkpoint.json",
    sourceUri: page.sourceUri,
    canonicalUri: input.pageScopedCheckpoint
      ? LAOS_BASELINE_INDEX_CHECKPOINT_URI + "/page/" + page.page
      : LAOS_BASELINE_INDEX_CHECKPOINT_URI,
    parentCanonicalUris: [pageCheckpointUri, admissionUri],
    content: jsonBytes(checkpoint),
  };
  return { pageArtifacts, checkpointArtifact, checkpoint };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(label + " must be an object");
  }
  return value as Record<string, unknown>;
}

export function parseLaosBaselineIndexCheckpoint(
  artifact: AcquiredCollectionArtifact,
): LaosBaselineIndexCheckpoint {
  if (
    artifact.artifactKind !== "JSON" ||
    !artifact.canonicalUri ||
    (artifact.canonicalUri !== LAOS_BASELINE_INDEX_CHECKPOINT_URI &&
      !artifact.canonicalUri.startsWith(LAOS_BASELINE_INDEX_CHECKPOINT_URI + "/page/"))
  ) {
    throw new TypeError("Lao baseline checkpoint RawArtifact identity is invalid");
  }
  let root: Record<string, unknown>;
  try {
    root = record(JSON.parse(decoder.decode(artifact.content)), "checkpoint");
  } catch (error) {
    if (error instanceof TypeError) throw error;
    throw new TypeError("Lao baseline checkpoint must be valid UTF-8 JSON");
  }

  const total = root.sourceTotal;
  const completedPage = root.completedPage;
  const requiredPages = root.requiredPages;
  const digests = root.committedPageIdsSha256;
  const uniqueCount = root.committedUniqueCount;
  const lastPageCheckpoint = root.lastPageCheckpointCanonicalUri;
  const lastAdmission = root.lastPageAdmissionCanonicalUri;
  const expectedBase = "la-dipo://wopublish/trademarks/list/page/" + String(completedPage);

  if (
    root.schemaVersion !== LAOS_BASELINE_INDEX_CHECKPOINT_SCHEMA ||
    root.sourceId !== LAOS_SOURCE_ID ||
    (artifact.canonicalUri !== LAOS_BASELINE_INDEX_CHECKPOINT_URI &&
      artifact.canonicalUri !==
        LAOS_BASELINE_INDEX_CHECKPOINT_URI + "/page/" + String(completedPage)) ||
    !Number.isSafeInteger(total) ||
    (total as number) <= 100 ||
    (total as number) > 100_000 ||
    !Number.isSafeInteger(completedPage) ||
    !Number.isSafeInteger(requiredPages) ||
    requiredPages !== Math.ceil((total as number) / 50) ||
    (completedPage as number) < 1 ||
    (completedPage as number) > (requiredPages as number) ||
    !Array.isArray(digests) ||
    digests.length !== completedPage ||
    digests.some((value) => typeof value !== "string" || !SHA256.test(value)) ||
    uniqueCount !== Math.min(total as number, (completedPage as number) * 50) ||
    root.complete !== (completedPage === requiredPages) ||
    root.nextPage !== (completedPage === requiredPages ? null : (completedPage as number) + 1) ||
    typeof root.observedAt !== "string" ||
    Number.isNaN(Date.parse(root.observedAt)) ||
    lastPageCheckpoint !== expectedBase + "/resume-checkpoint" ||
    lastAdmission !== expectedBase + "/fact-admission-request"
  ) {
    throw new TypeError("Lao baseline checkpoint content is inconsistent");
  }

  return {
    schemaVersion: LAOS_BASELINE_INDEX_CHECKPOINT_SCHEMA,
    sourceId: LAOS_SOURCE_ID,
    sourceTotal: total as number,
    completedPage: completedPage as number,
    requiredPages: requiredPages as number,
    committedPageIdsSha256: Object.freeze([...(digests as string[])]),
    committedUniqueCount: uniqueCount as number,
    complete: root.complete as boolean,
    nextPage: root.nextPage as number | null,
    observedAt: root.observedAt as string,
    lastPageCheckpointCanonicalUri: lastPageCheckpoint as string,
    lastPageAdmissionCanonicalUri: lastAdmission as string,
  };
}

export function laosIndexResumeFromCheckpoint(
  checkpoint: LaosBaselineIndexCheckpoint,
): LaosIndexResume {
  if (checkpoint.complete) {
    throw new TypeError("Complete Lao baseline checkpoint cannot be resumed");
  }
  return {
    sourceTotal: checkpoint.sourceTotal,
    committedPageIdsSha256: [...checkpoint.committedPageIdsSha256],
  };
}

export async function commitLaosBaselineIndexStream(input: {
  pages: AsyncGenerator<LaosIndexPage, { sourceTotal: number; uniqueIds: number }, void>;
  writer: LaosBaselineIndexStreamWriter;
  resume?: LaosBaselineIndexCheckpoint;
}): Promise<{
  checkpoint: LaosBaselineIndexCheckpoint;
  writtenArtifactIds: readonly string[];
  bytesPrepared: number;
}> {
  let committed = input.resume ? [...input.resume.committedPageIdsSha256] : [];
  let lastCheckpoint = input.resume;
  const writtenArtifactIds: string[] = [];
  let bytesPrepared = 0;
  while (true) {
    const next = await input.pages.next();
    if (next.done) {
      if (!lastCheckpoint || !lastCheckpoint.complete) {
        throw new TypeError("Lao index stream ended without a complete durable checkpoint");
      }
      if (
        next.value.sourceTotal !== lastCheckpoint.sourceTotal ||
        next.value.uniqueIds !== lastCheckpoint.sourceTotal
      ) {
        throw new TypeError("Lao index terminal totals do not match durable checkpoint");
      }
      return {
        checkpoint: lastCheckpoint,
        writtenArtifactIds: Object.freeze(writtenArtifactIds),
        bytesPrepared,
      };
    }

    const commit = buildLaosBaselineIndexPageCommit({
      page: next.value,
      committedPageIdsSha256: committed,
    });
    for (const artifact of commit.pageArtifacts) {
      const result = await input.writer.write(artifact);
      if (!result.reused) {
        bytesPrepared += result.sizeBytes;
        writtenArtifactIds.push(result.artifactId);
      }
    }
    // This cumulative checkpoint is written only after all four #911 page artifacts
    // are durable, so its page cursor can never outrun prepared admission evidence.
    const checkpointResult = await input.writer.write(commit.checkpointArtifact);
    if (!checkpointResult.reused) {
      bytesPrepared += checkpointResult.sizeBytes;
      writtenArtifactIds.push(checkpointResult.artifactId);
    }
    committed = [...commit.checkpoint.committedPageIdsSha256];
    lastCheckpoint = commit.checkpoint;
    input.writer.retainCanonicalUris([LAOS_BASELINE_INDEX_CHECKPOINT_URI]);
  }
}

export function isLaosPerPageCheckpointArtifact(artifact: AcquiredCollectionArtifact): boolean {
  if (artifact.artifactKind !== "JSON" || !artifact.canonicalUri?.endsWith("/resume-checkpoint")) {
    return false;
  }
  try {
    const root = record(JSON.parse(decoder.decode(artifact.content)), "page checkpoint");
    return root.schemaVersion === LAOS_FULL_INDEX_CHECKPOINT_SCHEMA;
  } catch {
    return false;
  }
}
