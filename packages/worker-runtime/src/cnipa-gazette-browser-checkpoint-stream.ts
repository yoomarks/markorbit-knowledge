import type { AcquiredCollectionArtifact } from "./artifact-backed-collection-executor";
import {
  acceptCnipaGazetteBrowserSourcePage,
  createCnipaGazetteBrowserStreamState,
  type CnipaGazetteBrowserLogicalPage,
  type CnipaGazetteBrowserStreamSession,
  type CnipaGazetteBrowserStreamState,
} from "./cnipa-gazette-browser-stream";
import {
  buildCnipaGazetteBrowserCheckpointEvidence,
  buildCnipaGazetteBrowserDatasetIdentity,
  buildCnipaGazetteBrowserLogicalPageEvidence,
  buildCnipaGazetteBrowserSourcePageEvidence,
  buildCnipaGazetteBrowserStreamStateArtifact,
  type CnipaGazetteBrowserSourcePageEvidence,
} from "./cnipa-gazette-browser-stream-artifacts";
import {
  cnipaGazetteBrowserEffectiveCheckpointPages,
  planCnipaGazetteBrowserCheckpointRanges,
  type CnipaGazetteBrowserCheckpointRangePlan,
} from "./cnipa-gazette-browser-checkpoint-plan";
import {
  buildCnipaGazetteDataEngineChunkPackage,
  type CnipaGazetteDatasetIdentityEnvelope,
} from "./cnipa-gazette-data-engine-handoff";
import { buildCnipaGazetteChunkAdmissionRequestArtifact } from "./cnipa-gazette-fact-admission-artifacts";
import type {
  StreamingArtifactWriteResult,
  StreamingArtifactWriter,
} from "./streaming-artifact-writer";

export type CnipaGazetteBrowserCheckpointCommit = {
  rangePlan: CnipaGazetteBrowserCheckpointRangePlan;
  checkpointArtifact: StreamingArtifactWriteResult;
  datasetIdentityArtifact: StreamingArtifactWriteResult;
  chunkRequestArtifact: StreamingArtifactWriteResult;
  sourceDatasetSha256: string;
  rowCount: number;
};

export type CnipaGazetteBrowserPageCommit = {
  sourcePageIndex: number;
  state: CnipaGazetteBrowserStreamState;
  rawArtifact: StreamingArtifactWriteResult;
  sourceProjectionArtifact: StreamingArtifactWriteResult;
  stateArtifact: StreamingArtifactWriteResult;
  logicalProjectionArtifacts: readonly StreamingArtifactWriteResult[];
  checkpoint: CnipaGazetteBrowserCheckpointCommit | null;
  completed: boolean;
};

type StreamWriter = Pick<StreamingArtifactWriter, "write" | "retainCanonicalUris">;

function canonicalUri(artifact: AcquiredCollectionArtifact, label: string): string {
  const value = artifact.canonicalUri?.trim();
  if (!value) throw new TypeError(`${label} canonicalUri is required`);
  return value;
}

export class CnipaGazetteBrowserCheckpointStream {
  private state: CnipaGazetteBrowserStreamState;
  private checkpointIndex = 0;
  private logicalPages: CnipaGazetteBrowserLogicalPage[] = [];
  private firstSourcePageEvidence: CnipaGazetteBrowserSourcePageEvidence | null = null;
  private datasetIdentity: CnipaGazetteDatasetIdentityEnvelope | null = null;
  private readonly ranges: readonly CnipaGazetteBrowserCheckpointRangePlan[];
  private readonly effectiveLogicalPagesPerCheckpoint: number;

  constructor(
    private readonly session: CnipaGazetteBrowserStreamSession,
    private readonly writer: StreamWriter,
    input: {
      targetLogicalPagesPerCheckpoint?: number;
    } = {},
  ) {
    this.state = createCnipaGazetteBrowserStreamState(session);
    this.effectiveLogicalPagesPerCheckpoint = cnipaGazetteBrowserEffectiveCheckpointPages({
      sourcePageSize: session.sourcePageSize,
      ...(input.targetLogicalPagesPerCheckpoint !== undefined
        ? {
            targetLogicalPagesPerCheckpoint: input.targetLogicalPagesPerCheckpoint,
          }
        : {}),
    });
    this.ranges = planCnipaGazetteBrowserCheckpointRanges({
      sourceTotal: session.sourceTotal,
      sourcePageSize: session.sourcePageSize,
      targetLogicalPagesPerCheckpoint: this.effectiveLogicalPagesPerCheckpoint,
    });
  }

  snapshot(): CnipaGazetteBrowserStreamState {
    return this.state;
  }

  checkpointPlans(): readonly CnipaGazetteBrowserCheckpointRangePlan[] {
    return this.ranges;
  }

  private currentRange(): CnipaGazetteBrowserCheckpointRangePlan {
    const range = this.ranges[this.checkpointIndex];
    if (!range) {
      throw new TypeError("browser Gazette checkpoint stream has no remaining range");
    }
    return range;
  }

  private assertRequestedSourcePage(pageIndex: number): void {
    if (!Number.isSafeInteger(pageIndex) || pageIndex !== this.state.nextSourcePageIndex) {
      throw new TypeError(
        `source page sequence mismatch: expected ${this.state.nextSourcePageIndex}, got ${pageIndex}`,
      );
    }
    const range = this.currentRange();
    if (pageIndex < range.sourceRange.startPage || pageIndex > range.sourceRange.endPage) {
      throw new TypeError("source page is outside the active checkpoint range");
    }
  }

  async acceptSourcePage(input: {
    requestedPageIndex: number;
    observedAt: string;
    httpStatus: number;
    rawBody: Uint8Array;
    contentType?: string;
  }): Promise<CnipaGazetteBrowserPageCommit> {
    this.assertRequestedSourcePage(input.requestedPageIndex);
    const range = this.currentRange();
    const sourceEvidence = buildCnipaGazetteBrowserSourcePageEvidence({
      session: this.session,
      requestedPageIndex: input.requestedPageIndex,
      observedAt: input.observedAt,
      httpStatus: input.httpStatus,
      rawBody: input.rawBody,
      ...(input.contentType ? { contentType: input.contentType } : {}),
    });

    const rawArtifact = await this.writer.write(sourceEvidence.rawArtifact);
    const sourceProjectionArtifact = await this.writer.write(sourceEvidence.projectionArtifact);

    const accepted = acceptCnipaGazetteBrowserSourcePage({
      session: this.session,
      state: this.state,
      page: sourceEvidence.page,
    });
    const stateArtifact = await this.writer.write(
      buildCnipaGazetteBrowserStreamStateArtifact({
        session: this.session,
        state: accepted.state,
        observedAt: sourceEvidence.page.observedAt,
      }),
    );

    const logicalProjectionArtifacts: StreamingArtifactWriteResult[] = [];
    for (const page of accepted.logicalPages) {
      const evidence = buildCnipaGazetteBrowserLogicalPageEvidence({
        session: this.session,
        page,
      });
      logicalProjectionArtifacts.push(await this.writer.write(evidence.projectionArtifact));
    }

    const nextLogicalPages = [...this.logicalPages, ...accepted.logicalPages];
    const firstSourcePageEvidence =
      this.firstSourcePageEvidence ??
      (sourceEvidence.page.sourcePageIndex === 1 ? sourceEvidence : null);
    let datasetIdentity = this.datasetIdentity;
    let checkpointCommit: CnipaGazetteBrowserCheckpointCommit | null = null;

    const checkpointBoundary = sourceEvidence.page.sourcePageIndex === range.sourceRange.endPage;
    if (checkpointBoundary) {
      const expectedLogicalPages = range.logicalRange.endPage - range.logicalRange.startPage + 1;
      if (
        nextLogicalPages.length !== expectedLogicalPages ||
        nextLogicalPages[0]?.pageIndex !== range.logicalRange.startPage ||
        nextLogicalPages.at(-1)?.pageIndex !== range.logicalRange.endPage
      ) {
        throw new TypeError("browser checkpoint logical pages do not match the planned range");
      }
      if (!range.terminal && accepted.state.tailRows.length !== 0) {
        throw new TypeError("non-terminal browser checkpoint cannot retain a logical tail");
      }

      const checkpointEvidence = buildCnipaGazetteBrowserCheckpointEvidence({
        session: this.session,
        range: range.logicalRange,
        logicalPages: nextLogicalPages,
        pagesPerCheckpoint: this.effectiveLogicalPagesPerCheckpoint,
      });
      const checkpointArtifact = await this.writer.write(checkpointEvidence.checkpointArtifact);

      if (datasetIdentity === null) {
        if (!firstSourcePageEvidence) {
          throw new TypeError("first browser checkpoint is missing source page 1 evidence");
        }
        datasetIdentity = buildCnipaGazetteBrowserDatasetIdentity({
          session: this.session,
          firstCheckpoint: checkpointEvidence,
          firstSourcePageEvidence,
        });
      }
      const datasetIdentityArtifact = await this.writer.write(datasetIdentity.artifact);

      const chunkPackage = buildCnipaGazetteDataEngineChunkPackage({
        checkpoint: checkpointEvidence.checkpoint,
        datasetIdentity,
        collectedAt: sourceEvidence.page.observedAt,
      });
      const chunkRequest = buildCnipaGazetteChunkAdmissionRequestArtifact({
        package: chunkPackage,
        datasetIdentityCanonicalUri: canonicalUri(datasetIdentity.artifact, "dataset identity"),
        checkpointCanonicalUri: canonicalUri(checkpointEvidence.checkpointArtifact, "checkpoint"),
        createdAt: sourceEvidence.page.observedAt,
      });
      const chunkRequestArtifact = await this.writer.write(chunkRequest);

      checkpointCommit = {
        rangePlan: range,
        checkpointArtifact,
        datasetIdentityArtifact,
        chunkRequestArtifact,
        sourceDatasetSha256: datasetIdentity.sourceDatasetSha256,
        rowCount: checkpointEvidence.checkpoint.rowCount,
      };
    }

    // In-memory progress advances only after every durable write for this page
    // succeeds. A failure before this point can replay the same page; the
    // writer reuses canonical+SHA-identical artifacts that already finalized.
    this.state = accepted.state;
    this.firstSourcePageEvidence = firstSourcePageEvidence;
    this.datasetIdentity = datasetIdentity;

    if (checkpointCommit) {
      this.checkpointIndex += 1;
      this.logicalPages = [];
      const keep = this.datasetIdentity
        ? [canonicalUri(this.datasetIdentity.artifact, "dataset identity")]
        : [];
      this.writer.retainCanonicalUris(keep);
      if (this.datasetIdentity !== null) {
        this.firstSourcePageEvidence = null;
      }
    } else {
      this.logicalPages = nextLogicalPages;
    }
    return {
      sourcePageIndex: sourceEvidence.page.sourcePageIndex,
      state: this.state,
      rawArtifact,
      sourceProjectionArtifact,
      stateArtifact,
      logicalProjectionArtifacts,
      checkpoint: checkpointCommit,
      completed: this.state.completed,
    };
  }
}
