"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, FlaskConical } from "lucide-react";
import type { ExecutionAttemptRecord } from "@markorbit/persistence/worker-execution";

export function ExecutionTimeline({ runId }: { runId: string }) {
  const [records, setRecords] = useState<ExecutionAttemptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/runs/${runId}/executions`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as {
          executions?: ExecutionAttemptRecord[];
          error?: { message?: string };
        };
        if (!response.ok || !body.executions) {
          throw new Error(body.error?.message ?? "Unable to load execution evidence");
        }
        setRecords(body.executions);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load execution evidence",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [runId]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-950">Worker execution evidence</h2>
            <p className="mt-1 text-sm text-slate-500">
              真实状态转换与追加式事件记录。Fixture runtime 不执行网络或文件操作。
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700">
            <FlaskConical size={15} aria-hidden="true" /> Fixture-ready
          </span>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-slate-500">正在读取执行证据…</div>
      ) : null}
      {error ? (
        <div className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {!loading && !error && records.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">
          尚未开始执行。LEASED 只代表 Worker 已保留任务。
        </div>
      ) : null}

      <div className="divide-y divide-slate-100">
        {records.map(({ attempt, events }) => (
          <article key={attempt.id} className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {attempt.id}
                </p>
                <h3 className="mt-2 font-semibold text-slate-950">
                  {attempt.executor.executorId}@{attempt.executor.version}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Worker {attempt.workerId} · Lease {attempt.leaseId}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  attempt.status === "COMPLETED"
                    ? "bg-emerald-50 text-emerald-700"
                    : attempt.status === "FAILED"
                      ? "bg-rose-50 text-rose-700"
                      : "bg-blue-50 text-blue-700"
                }`}
              >
                {attempt.status}
              </span>
            </div>

            <ol className="mt-6 space-y-3">
              {events.map((event) => (
                <li key={event.id} className="flex gap-3">
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600">
                    {event.toStatus === "COMPLETED" ? (
                      <CheckCircle2 size={15} aria-hidden="true" />
                    ) : event.toStatus === "FAILED" ? (
                      <AlertTriangle size={15} aria-hidden="true" />
                    ) : (
                      <Clock3 size={15} aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {event.eventType} → {event.toStatus}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      #{event.sequence} · {new Date(event.recordedAt).toLocaleString("zh-CN")} ·
                      Idempotency {event.idempotencyKey}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            {attempt.receipt ? (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <p className="font-medium">Metadata-only completion receipt</p>
                <p className="mt-1">
                  {attempt.receipt.itemsObserved} items · {attempt.receipt.bytesPrepared} bytes ·{" "}
                  {attempt.receipt.outputKinds.join(", ")}
                </p>
                {attempt.receipt.summary ? <p className="mt-2">{attempt.receipt.summary}</p> : null}
              </div>
            ) : null}

            {attempt.failure ? (
              <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                <p className="font-medium">{attempt.failure.code}</p>
                <p className="mt-1">{attempt.failure.message}</p>
                <p className="mt-2 text-xs">
                  Retryable evidence: {String(attempt.failure.retryable)}
                </p>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
