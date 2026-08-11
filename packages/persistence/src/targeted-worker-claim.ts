import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  WORKER_PROTOCOL_VERSION,
  isJob,
  isJobLease,
  type ConnectorCapability,
  type Job,
  type JobLease,
  type WorkerDefinition,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "./index";
import {
  DEFAULT_LEASE_DURATION_MS,
  SqliteWorkerRegistryRepository,
  ensureWorkerRegistry,
  type ClaimResult,
} from "./safe-worker-registry";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeBase32(value: bigint, length: number): string {
  let output = "";
  let remaining = value;
  for (let index = 0; index < length; index += 1) {
    output = CROCKFORD[Number(remaining & 31n)] + output;
    remaining >>= 5n;
  }
  return output;
}

function generateLeaseId(now = Date.now()): string {
  const timestamp = encodeBase32(BigInt(now), 10);
  const randomValue = BigInt(`0x${randomBytes(10).toString("hex")}`);
  return `lse_${timestamp}${encodeBase32(randomValue, 16)}`;
}

function generateLeaseToken(): string {
  return `mls_${randomBytes(32).toString("base64url")}`;
}

function digestHex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function parseJob(value: string): Job {
  const parsed = JSON.parse(value) as unknown;
  if (!isJob(parsed)) {
    throw new RegistryValidationError("Persisted Job no longer satisfies Execution Contract v1");
  }
  return parsed;
}

function requiredCapabilities(job: Job): ConnectorCapability[] {
  const required = new Set<ConnectorCapability>(["COLLECT"]);
  if (job.planSnapshot.policy.renderJavascript) required.add("RENDER_JAVASCRIPT");
  if (job.planSnapshot.policy.fetchAttachments) required.add("FETCH_ATTACHMENTS");
  if (job.planSnapshot.schedule.mode === "CHANGE_WATCH") {
    if (job.connectorSnapshot.capabilities.includes("CHECK_UPDATE")) required.add("CHECK_UPDATE");
    else required.add("WATCH");
  }
  return [...required];
}

function workerCanRun(worker: WorkerDefinition, job: Job): boolean {
  if (!worker.supportedJobTypes.includes(job.jobType)) return false;
  const binding = worker.connectorBindings.find(
    (candidate) =>
      candidate.connectorId === job.connector.connectorId &&
      candidate.version === job.connector.version,
  );
  if (!binding) return false;
  return requiredCapabilities(job).every((capability) => binding.capabilities.includes(capability));
}

function leasedJob(job: Job, timestamp: string): Job {
  const next: Job = { ...clone(job), status: "LEASED", updatedAt: timestamp };
  if (!isJob(next)) {
    throw new RegistryValidationError("Job transition does not satisfy Execution Contract v1");
  }
  return next;
}

export function claimSpecificJob(
  database: DatabaseSync,
  workerId: string,
  credential: string,
  jobId: string,
  clock: () => Date = () => new Date(),
): ClaimResult {
  ensureWorkerRegistry(database);
  const workers = new SqliteWorkerRegistryRepository(database, clock);
  workers.reapExpired();
  const worker = workers.verifyCredential(workerId, credential);
  const view = workers.getById(workerId);
  if (!view) {
    throw new RegistryConflictError("WORKER_NOT_AVAILABLE", "Targeted Worker is not available");
  }
  if (worker.desiredState !== "ACTIVE") {
    throw new RegistryConflictError("WORKER_NOT_ACTIVE", "Only an ACTIVE Worker may claim work");
  }
  if (view.effectiveStatus === "OFFLINE") {
    throw new RegistryConflictError(
      "WORKER_HEARTBEAT_STALE",
      "A fresh heartbeat is required before claiming work",
    );
  }
  if (view.effectiveStatus === "ERROR") {
    throw new RegistryConflictError(
      "WORKER_HEALTH_ERROR",
      "A Worker reporting ERROR health cannot claim work",
    );
  }
  if (view.activeLeaseCount >= worker.maxConcurrency) {
    throw new RegistryConflictError("WORKER_AT_CAPACITY", "Worker has reached maxConcurrency");
  }

  const now = clock();
  const timestamp = now.toISOString();
  database.exec("BEGIN IMMEDIATE;");
  try {
    const row = database
      .prepare("SELECT document_json, available_at FROM jobs WHERE id = ?")
      .get(jobId) as { document_json: string; available_at: string } | undefined;
    if (!row) {
      throw new RegistryConflictError("JOB_NOT_FOUND", `Target Job ${jobId} was not found`);
    }
    const job = parseJob(row.document_json);
    if (job.status !== "PENDING" || Date.parse(row.available_at) > now.getTime()) {
      throw new RegistryConflictError(
        "JOB_NOT_CLAIMABLE",
        "Target Job is not pending and available for claim",
      );
    }
    if (job.workspaceId !== worker.workspaceId || !workerCanRun(worker, job)) {
      throw new RegistryConflictError(
        "WORKER_JOB_INCOMPATIBLE",
        "Target Worker cannot execute the requested Job",
      );
    }

    const leaseToken = generateLeaseToken();
    const lease: JobLease = {
      contractVersion: WORKER_PROTOCOL_VERSION,
      objectType: "JOB_LEASE",
      id: generateLeaseId(now.getTime()),
      workspaceId: job.workspaceId,
      workerId: worker.id,
      jobId: job.id,
      runId: job.runId,
      jobType: job.jobType,
      connector: clone(job.connector),
      status: "ACTIVE",
      acquiredAt: timestamp,
      expiresAt: new Date(now.getTime() + DEFAULT_LEASE_DURATION_MS).toISOString(),
      updatedAt: timestamp,
    };
    if (!isJobLease(lease)) {
      throw new RegistryValidationError("Lease does not satisfy Worker Protocol v1");
    }
    const nextJob = leasedJob(job, timestamp);
    const update = database
      .prepare(
        `UPDATE jobs SET status = ?, document_json = ?, updated_at = ?
         WHERE id = ? AND status = 'PENDING'`,
      )
      .run(nextJob.status, JSON.stringify(nextJob), nextJob.updatedAt, job.id);
    if (Number(update.changes) !== 1) {
      throw new RegistryConflictError("JOB_CLAIM_CONFLICT", "Job was claimed by another Worker");
    }
    database
      .prepare(
        `INSERT INTO job_leases (
           id, workspace_id, worker_id, job_id, run_id, connector_id,
           connector_version, job_type, status, token_digest, document_json,
           acquired_at, expires_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        lease.id,
        lease.workspaceId,
        lease.workerId,
        lease.jobId,
        lease.runId,
        lease.connector.connectorId,
        lease.connector.version,
        lease.jobType,
        lease.status,
        digestHex(leaseToken),
        JSON.stringify(lease),
        lease.acquiredAt,
        lease.expiresAt,
        lease.updatedAt,
      );
    database.exec("COMMIT;");
    return { job: nextJob, lease, leaseToken };
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}
