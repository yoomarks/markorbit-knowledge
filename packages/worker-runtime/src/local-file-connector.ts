import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { ExecutionExecutor, ExecutionReceipt } from "@markorbit/contracts";
import type { ArtifactIngestionPort } from "./artifact-ingestion-port";
import type { ClaimedExecutionContext, ConnectorExecutor, WorkerExecutionClient } from "./index";

export const LOCAL_FILE_EXECUTOR: ExecutionExecutor = {
  executorId: "local-file-connector",
  version: "1.0.0",
  mode: "PRODUCTION",
};

export type LocalFileIntakeRequest = {
  sourceId: string;
  fileName: string;
  content: string | Uint8Array;
};

export type LocalFileIntakeResult = {
  sourceId: string;
  artifactCandidates: Array<{
    id: string;
    fileName: string;
    contentHash: string;
    sizeBytes: number;
  }>;
};

/** Lightweight local-ingest preparation boundary retained for callers that do
 * not yet participate in the leased ConnectorExecutor lifecycle. */
export class LocalFileConnector {
  async ingest(request: LocalFileIntakeRequest): Promise<LocalFileIntakeResult> {
    const bytes = typeof request.content === "string" ? Buffer.from(request.content) : request.content;
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    return {
      sourceId: request.sourceId,
      artifactCandidates: [
        {
          id: `local-${contentHash.slice(0, 16)}`,
          fileName: request.fileName,
          contentHash,
          sizeBytes: bytes.byteLength,
        },
      ],
    };
  }
}

export class LocalFileConnectorExecutor implements ConnectorExecutor {
  readonly executor = LOCAL_FILE_EXECUTOR;

  constructor(private readonly ingestion: ArtifactIngestionPort) {}

  async execute(
    context: ClaimedExecutionContext,
    client: WorkerExecutionClient,
  ): Promise<ExecutionReceipt | null> {
    const compatibleJob = context.job as typeof context.job & {
      planSnapshot: typeof context.job.planSnapshot & { input?: { path?: unknown } };
      sourceSnapshot?: { connectorConfig?: Record<string, unknown> };
    };
    const filePath = String(
      compatibleJob.planSnapshot.input?.path ??
        compatibleJob.sourceSnapshot?.connectorConfig?.path ??
        "",
    );
    if (!filePath) return null;

    await client.start(context, this.executor, `${context.lease.id}-start`);

    const content = await readFile(filePath);
    const sha256 = createHash("sha256").update(content).digest("hex");

    const ingestionReceipt = await this.ingestion.ingest({
      artifactId: `${context.job.id}-${sha256.slice(0, 12)}`,
      sourceId: context.job.sourceId,
      contentHash: sha256,
      contentLength: content.length,
      mimeType: "application/octet-stream",
      provenance: {
        connector: "local-file",
        filename: basename(filePath),
      },
    });

    const receipt: ExecutionReceipt = {
      executor: this.executor,
      outputKinds: [...context.job.planSnapshot.output.artifactKinds],
      itemsObserved: 1,
      bytesPrepared: content.length,
      metadataOnly: false,
      artifactReceiptIds: [ingestionReceipt.receiptId],
      summary: "Local file ingested as RawArtifact.",
    };

    await client.complete(context, receipt, `${context.lease.id}-complete`);
    return receipt;
  }
}
