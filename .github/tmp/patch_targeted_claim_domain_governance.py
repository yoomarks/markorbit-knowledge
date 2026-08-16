from pathlib import Path

worker_path = Path("packages/persistence/src/worker-registry.ts")
text = worker_path.read_text()
text = text.replace(
'''  claim(workerId: string, credential: string): ClaimResult;
  renewLease(workerId: string, credential: string, leaseId: string, leaseToken: string): JobLease;
''',
'''  claim(workerId: string, credential: string): ClaimResult;
  claimSpecific(workerId: string, credential: string, jobId: string): ClaimResult;
  renewLease(workerId: string, credential: string, leaseId: string, leaseToken: string): JobLease;
''', 1)

old_block = '''      const leaseToken = generateLeaseToken();
      const lease: JobLease = {
        contractVersion: WORKER_PROTOCOL_VERSION,
        objectType: "JOB_LEASE",
        id: this.leaseIdFactory(),
        workspaceId: job.workspaceId,
        workerId: worker.id,
        jobId: job.id,
        runId: job.runId,
        jobType: job.jobType,
        connector: clone(job.connector),
        status: "ACTIVE",
        acquiredAt: timestamp,
        expiresAt: new Date(now.getTime() + this.leaseDurationMs).toISOString(),
        updatedAt: timestamp,
      };
      if (!isJobLease(lease)) {
        throw new RegistryValidationError("Lease does not satisfy Worker Protocol v1");
      }
      const leasedJob = jobWithStatus(job, "LEASED", timestamp);
      const leaseData = leaseRow(lease);
      const jobUpdate = this.database
        .prepare(
          `UPDATE jobs SET status = ?, document_json = ?, updated_at = ?
           WHERE id = ? AND status = 'PENDING'`,
        )
        .run(leasedJob.status, JSON.stringify(leasedJob), leasedJob.updatedAt, job.id);
      if (Number(jobUpdate.changes) !== 1) {
        throw new RegistryConflictError("JOB_CLAIM_CONFLICT", "Job was claimed by another Worker");
      }
      this.database
        .prepare(
          `INSERT INTO job_leases (
             id, workspace_id, worker_id, job_id, run_id, connector_id,
             connector_version, job_type, status, token_digest, document_json,
             acquired_at, expires_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          leaseData.id,
          leaseData.workspaceId,
          leaseData.workerId,
          leaseData.jobId,
          leaseData.runId,
          leaseData.connectorId,
          leaseData.connectorVersion,
          leaseData.jobType,
          leaseData.status,
          digestHex(leaseToken),
          leaseData.documentJson,
          leaseData.acquiredAt,
          leaseData.expiresAt,
          leaseData.updatedAt,
        );
      this.database.exec("COMMIT;");
      return { job: leasedJob, lease, leaseToken };
'''
new_block = '''      const result = this.claimJobInTransaction(worker, job, now);
      this.database.exec("COMMIT;");
      return result;
'''
if text.count(old_block) != 1:
    raise SystemExit(f"normal claim lease block count={text.count(old_block)}")
text = text.replace(old_block, new_block, 1)

anchor = '''  private webDomainLeaseState(now: Date): Map<string, WebDomainLeaseState> {
'''
specific_method = '''  claimSpecific(workerId: string, credential: string, jobId: string): ClaimResult {
    this.verifyCredential(workerId, credential);
    const now = this.clock();
    const timestamp = now.toISOString();
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.reapExpiredInTransaction(timestamp);
      const worker = this.getWorker(workerId);
      if (!worker) throw new WorkerNotFoundError(workerId);
      if (worker.desiredState !== "ACTIVE") {
        throw new WorkerAuthorizationError(
          "WORKER_NOT_ACTIVE",
          "Only an ACTIVE Worker may claim work",
        );
      }
      const view = this.viewForWorker(worker);
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

      const row = this.database
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
      if (!this.webDomainQuotaAllows(job, this.webDomainLeaseState(now))) {
        throw new RegistryConflictError(
          "WEB_DOMAIN_CLAIM_QUOTA_EXCEEDED",
          "Target Job is temporarily blocked by the governed web-domain concurrency or rolling rate limit",
          { jobId: job.id, domain: webDomainKey(job) },
        );
      }

      const result = this.claimJobInTransaction(worker, job, now);
      this.database.exec("COMMIT;");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

'''
if text.count(anchor) != 1:
    raise SystemExit(f"web domain state anchor count={text.count(anchor)}")
text = text.replace(anchor, specific_method + anchor, 1)

anchor2 = '''  renewLease(workerId: string, credential: string, leaseId: string, leaseToken: string): JobLease {
'''
helper = '''  private claimJobInTransaction(worker: WorkerDefinition, job: Job, now: Date): ClaimResult {
    const timestamp = now.toISOString();
    const leaseToken = generateLeaseToken();
    const lease: JobLease = {
      contractVersion: WORKER_PROTOCOL_VERSION,
      objectType: "JOB_LEASE",
      id: this.leaseIdFactory(),
      workspaceId: job.workspaceId,
      workerId: worker.id,
      jobId: job.id,
      runId: job.runId,
      jobType: job.jobType,
      connector: clone(job.connector),
      status: "ACTIVE",
      acquiredAt: timestamp,
      expiresAt: new Date(now.getTime() + this.leaseDurationMs).toISOString(),
      updatedAt: timestamp,
    };
    if (!isJobLease(lease)) {
      throw new RegistryValidationError("Lease does not satisfy Worker Protocol v1");
    }
    const leasedJob = jobWithStatus(job, "LEASED", timestamp);
    const leaseData = leaseRow(lease);
    const jobUpdate = this.database
      .prepare(
        `UPDATE jobs SET status = ?, document_json = ?, updated_at = ?
         WHERE id = ? AND status = 'PENDING'`,
      )
      .run(leasedJob.status, JSON.stringify(leasedJob), leasedJob.updatedAt, job.id);
    if (Number(jobUpdate.changes) !== 1) {
      throw new RegistryConflictError("JOB_CLAIM_CONFLICT", "Job was claimed by another Worker");
    }
    this.database
      .prepare(
        `INSERT INTO job_leases (
           id, workspace_id, worker_id, job_id, run_id, connector_id,
           connector_version, job_type, status, token_digest, document_json,
           acquired_at, expires_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        leaseData.id,
        leaseData.workspaceId,
        leaseData.workerId,
        leaseData.jobId,
        leaseData.runId,
        leaseData.connectorId,
        leaseData.connectorVersion,
        leaseData.jobType,
        leaseData.status,
        digestHex(leaseToken),
        leaseData.documentJson,
        leaseData.acquiredAt,
        leaseData.expiresAt,
        leaseData.updatedAt,
      );
    return { job: leasedJob, lease, leaseToken };
  }

'''
if text.count(anchor2) != 1:
    raise SystemExit(f"renew anchor count={text.count(anchor2)}")
text = text.replace(anchor2, helper + anchor2, 1)
worker_path.write_text(text)

target_path = Path("packages/persistence/src/targeted-worker-claim.ts")
target_path.write_text('''import { DatabaseSync } from "node:sqlite";
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
''')

# Add a focused public-facade regression using the existing Worker Registry fixtures.
test_path = Path("packages/persistence/tests/worker-registry.test.ts")
test = test_path.read_text()
test = test.replace(
'''import { SqliteExecutionLedgerRepository } from "../src/execution-ledger";
''',
'''import { SqliteExecutionLedgerRepository } from "../src/execution-ledger";
import { claimSpecificJob } from "../src/targeted-worker-claim";
''', 1)
insert_anchor = '''  it("renews and releases only with owning credential and lease token", () => {
'''
addition = '''  it("applies the same domain governance to targeted exact-Job claims", () => {
    const env = environment(new DatabaseSync(":memory:"), {
      maxConcurrentWebLeasesPerDomain: 1,
      leaseDurationMs: 4_000,
    });
    const sameDomainJobs = ["a", "b"].map((suffix) => {
      const source = env.sources.create(
        sourceInput({
          name: `Same domain ${suffix}`,
          slug: `same-domain-${suffix}`,
          canonicalUri: `https://www.uspto.gov/${suffix}`,
          entrypoints: [{ uri: `https://www.uspto.gov/${suffix}` }],
        }),
      );
      const plan = env.plans.create(planInput(source.id, { name: `Same domain ${suffix} plan` }));
      return env.runs.dispatchManual({ planId: plan.plan.id }).record.jobs[0]!;
    });
    const otherSource = env.sources.create(
      sourceInput({
        name: "Other domain",
        slug: "other-domain",
        canonicalUri: "https://www.euipo.europa.eu/news",
        entrypoints: [{ uri: "https://www.euipo.europa.eu/news" }],
      }),
    );
    const otherPlan = env.plans.create(planInput(otherSource.id, { name: "Other domain plan" }));
    const otherJob = env.runs.dispatchManual({ planId: otherPlan.plan.id }).record.jobs[0]!;

    const firstWorker = env.workers.create(workerInput({ displayName: "Target Worker A" }));
    const secondWorker = env.workers.create(workerInput({ displayName: "Target Worker B" }));
    heartbeat(env, firstWorker.view.worker.id, firstWorker.credential);
    heartbeat(env, secondWorker.view.worker.id, secondWorker.credential);
    const options = {
      heartbeatFreshnessMs: 10_000,
      heartbeatClockSkewMs: 10_000,
      leaseDurationMs: 4_000,
      maxLeaseLifetimeMs: 10_000,
      maxConcurrentWebLeasesPerDomain: 1,
    };

    const first = claimSpecificJob(
      env.database,
      firstWorker.view.worker.id,
      firstWorker.credential,
      sameDomainJobs[0]!.id,
      env.clock,
      options,
    );
    expect(Date.parse(first.lease!.expiresAt) - Date.parse(first.lease!.acquiredAt)).toBe(4_000);
    expect(() =>
      claimSpecificJob(
        env.database,
        secondWorker.view.worker.id,
        secondWorker.credential,
        sameDomainJobs[1]!.id,
        env.clock,
        options,
      ),
    ).toThrowError(
      expect.objectContaining({
        code: "WEB_DOMAIN_CLAIM_QUOTA_EXCEEDED",
      }),
    );
    const other = claimSpecificJob(
      env.database,
      secondWorker.view.worker.id,
      secondWorker.credential,
      otherJob.id,
      env.clock,
      options,
    );
    expect(other.job?.sourceId).toBe(otherSource.id);
    env.database.close();
  });

  it("applies the strictest rolling domain rate limit to targeted claims", () => {
    const env = environment(new DatabaseSync(":memory:"), {
      maxConcurrentWebLeasesPerDomain: 10,
      leaseDurationMs: 2_000,
    });
    const jobs = ["rate-target-a", "rate-target-b", "rate-target-c"].map((slug, index) => {
      const source = env.sources.create(
        sourceInput({
          name: `Target rate ${index + 1}`,
          slug,
          canonicalUri: `https://www.uspto.gov/target-rate-${index + 1}`,
          entrypoints: [{ uri: `https://www.uspto.gov/target-rate-${index + 1}` }],
        }),
      );
      const plan = env.plans.create(
        planInput(source.id, {
          name: `Target rate ${index + 1} plan`,
          policy: { ...planInput(source.id).policy, rateLimitPerMinute: 2 },
        }),
      );
      return env.runs.dispatchManual({ planId: plan.plan.id }).record.jobs[0]!;
    });
    const workers = ["Rate Target A", "Rate Target B", "Rate Target C"].map((displayName) =>
      env.workers.create(workerInput({ displayName })),
    );
    for (const worker of workers) heartbeat(env, worker.view.worker.id, worker.credential);
    const options = {
      heartbeatFreshnessMs: 10_000,
      heartbeatClockSkewMs: 10_000,
      leaseDurationMs: 2_000,
      maxLeaseLifetimeMs: 10_000,
      maxConcurrentWebLeasesPerDomain: 10,
    };

    for (const index of [0, 1]) {
      expect(
        claimSpecificJob(
          env.database,
          workers[index]!.view.worker.id,
          workers[index]!.credential,
          jobs[index]!.id,
          env.clock,
          options,
        ).job,
      ).not.toBeNull();
    }
    expect(() =>
      claimSpecificJob(
        env.database,
        workers[2]!.view.worker.id,
        workers[2]!.credential,
        jobs[2]!.id,
        env.clock,
        options,
      ),
    ).toThrowError(expect.objectContaining({ code: "WEB_DOMAIN_CLAIM_QUOTA_EXCEEDED" }));

    env.advance(60_001);
    heartbeat(env, workers[2]!.view.worker.id, workers[2]!.credential);
    expect(
      claimSpecificJob(
        env.database,
        workers[2]!.view.worker.id,
        workers[2]!.credential,
        jobs[2]!.id,
        env.clock,
        options,
      ).job,
    ).not.toBeNull();
    env.database.close();
  });

'''
if test.count(insert_anchor) != 1:
    raise SystemExit(f"test insert anchor count={test.count(insert_anchor)}")
test_path.write_text(test.replace(insert_anchor, addition + insert_anchor, 1))
