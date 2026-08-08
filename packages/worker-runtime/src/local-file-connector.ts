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

    await this.ingestion.ingest({
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
      summary: "Local file ingested as RawArtifact.",
    };

    await client.complete(context, receipt, `${context.lease.id}-complete`);
    return receipt;
  }
}
