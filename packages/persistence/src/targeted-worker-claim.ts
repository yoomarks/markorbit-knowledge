import { DatabaseSync } from "node:sqlite";
import {
  SqliteWorkerRegistryRepository,
  type ClaimResult,
  type WorkerProtocolOptions,
} from "./safe-worker-registry";

/**
 * Backward-compatible exact-Job claim facade.
 *
 * All authorization, heartbeat, worker capacity, domain concurrency/rate quotas,
 * lease timing and atomic Job/lease transitions are owned by Worker Registry.
 */
export function claimSpecificJob(
  database: DatabaseSync,
  workerId: string,
  credential: string,
  jobId: string,
  clock: () => Date = () => new Date(),
  options: WorkerProtocolOptions = {},
): ClaimResult {
  return new SqliteWorkerRegistryRepository(
    database,
    clock,
    undefined,
    undefined,
    undefined,
    options,
  ).claimSpecific(workerId, credential, jobId);
}
