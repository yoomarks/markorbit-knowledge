import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  blockJobForRecovery,
  failJob,
  markRunning,
  recoverClaimedJob,
  type AiKnowledgeJob,
} from "./adk-knowledge-job-queue";
import {
  MemoryAiKnowledgeJobStore,
  SqliteAiKnowledgeJobStore,
} from "./adk-knowledge-job-queue-store";

const job: AiKnowledgeJob = {
  id: "job-store-1",
  assignmentId: "assignment-1",
  provider: "OPENAI",
  status: "QUEUED",
  attempts: 0,
  maxAttempts: 3,
  executionKey: "assignment-1:OPENAI:v1",
  createdAt: "2026-08-23T00:00:00.000Z",
  updatedAt: "2026-08-23T00:00:00.000Z",
  artifactIds: [],
};

function temporaryDatabase(): { directory: string; path: string } {
  const directory = mkdtempSync(join(tmpdir(), "markorbit-adk-queue-"));
  return { directory, path: join(directory, "queue.sqlite") };
}

describe("ADK knowledge job store", () => {
  it("keeps memory-store reads isolated and claims through the domain transition", () => {
    const store = new MemoryAiKnowledgeJobStore();

    store.put(job);
    const loaded = store.get(job.id);
    const claimed = store.claimNext();

    expect(loaded).toEqual(job);
    expect(loaded).not.toBe(job);
    expect(claimed?.status).toBe("CLAIMED");
    expect(store.get(job.id)?.status).toBe("CLAIMED");
    expect(store.claimNext()).toBeUndefined();
  });

  it("persists jobs across file-backed SQLite reopen", () => {
    const temporary = temporaryDatabase();
    try {
      const firstDatabase = new DatabaseSync(temporary.path);
      new SqliteAiKnowledgeJobStore(firstDatabase).put(job);
      firstDatabase.close();

      const reopenedDatabase = new DatabaseSync(temporary.path);
      const reopened = new SqliteAiKnowledgeJobStore(reopenedDatabase);
      expect(reopened.get(job.id)).toEqual(job);
      expect(reopened.getByExecutionKey(job.executionKey!)).toEqual(job);
      reopenedDatabase.close();
    } finally {
      rmSync(temporary.directory, { recursive: true, force: true });
    }
  });

  it("enforces execution-key idempotency and rejects conflicting duplicate work", () => {
    const database = new DatabaseSync(":memory:");
    const store = new SqliteAiKnowledgeJobStore(database);

    expect(store.put(job)).toEqual(job);
    expect(store.put(job)).toEqual(job);
    expect(() =>
      store.put({
        ...job,
        id: "job-store-conflict",
      }),
    ).toThrow(/execution key/u);
    database.close();
  });

  it("claims a queued job exactly once across repository instances", () => {
    const temporary = temporaryDatabase();
    try {
      const firstDatabase = new DatabaseSync(temporary.path);
      const secondDatabase = new DatabaseSync(temporary.path);
      const first = new SqliteAiKnowledgeJobStore(firstDatabase);
      const second = new SqliteAiKnowledgeJobStore(secondDatabase);
      first.put(job);

      expect(first.claimNext()?.status).toBe("CLAIMED");
      expect(second.claimNext()).toBeUndefined();
      expect(second.get(job.id)?.status).toBe("CLAIMED");

      firstDatabase.close();
      secondDatabase.close();
    } finally {
      rmSync(temporary.directory, { recursive: true, force: true });
    }
  });

  it("persists runtime and retry transitions", () => {
    const database = new DatabaseSync(":memory:");
    const store = new SqliteAiKnowledgeJobStore(database);
    store.put(job);

    const claimed = store.claimNext()!;
    const running = markRunning(claimed);
    store.save(running);
    const retryPending = failJob(running, "provider timeout");
    store.save(retryPending);

    expect(store.get(job.id)?.status).toBe("RETRY_PENDING");
    expect(store.get(job.id)?.attempts).toBe(1);
    database.close();
  });

  it("applies recovery updates only when the persisted status still matches", () => {
    const database = new DatabaseSync(":memory:");
    const store = new SqliteAiKnowledgeJobStore(database);
    store.put(job);
    const claimed = store.claimNext()!;

    expect(store.saveIfStatus(recoverClaimedJob(claimed), "CLAIMED")?.status).toBe("QUEUED");
    expect(store.saveIfStatus(recoverClaimedJob(claimed), "CLAIMED")).toBeUndefined();
    expect(store.get(job.id)?.status).toBe("QUEUED");
    database.close();
  });

  it("persists blocked-recovery states for uncertain running work", () => {
    const database = new DatabaseSync(":memory:");
    const store = new SqliteAiKnowledgeJobStore(database);
    store.put(job);
    const running = markRunning(store.claimNext()!);
    store.save(running);

    const blocked = blockJobForRecovery(running, "uncertain provider execution");
    store.save(blocked);

    expect(store.get(job.id)?.status).toBe("BLOCKED_RECOVERY");
    expect(store.get(job.id)?.error).toBe("uncertain provider execution");
    database.close();
  });
});
