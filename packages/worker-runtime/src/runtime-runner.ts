import type { ExecutionReceipt } from "@markorbit/contracts";
import type { ClaimedExecutionContext, ConnectorExecutor, WorkerExecutionClient } from "./index";

export type RuntimeRunnerResult =
  | { status: "COMPLETED"; receipt: ExecutionReceipt }
  | { status: "FAILED" };

export class WorkerRuntimeRunner {
  constructor(private readonly client: WorkerExecutionClient) {}

  async run(
    context: ClaimedExecutionContext,
    executor: ConnectorExecutor,
  ): Promise<RuntimeRunnerResult> {
    const receipt = await executor.execute(context, this.client);

    if (!receipt) {
      return { status: "FAILED" };
    }

    return {
      status: "COMPLETED",
      receipt,
    };
  }
}
