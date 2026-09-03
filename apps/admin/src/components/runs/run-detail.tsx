"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Ban, Clock3 } from "lucide-react";
import type { ExecutionRunRecord } from "@markorbit/persistence/execution-ledger";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";

export function RunDetail({ runId }: { runId: string }) {
  const [record, setRecord] = useState<ExecutionRunRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/runs/${runId}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as {
          run?: ExecutionRunRecord;
          error?: { message?: string };
        };
        if (!response.ok || !body.run) {
          throw new Error(body.error?.message ?? "Unable to load execution run");
        }
        setRecord(body.run);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load run");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [runId]);

  async function cancel() {
    if (!record || record.run.status !== "PENDING") return;
    const reason = window.prompt("取消原因（可选）", "Operator cancelled before Worker execution");
    if (reason === null) return;
    if (!window.confirm("确认取消该待运行记录？关联的 PENDING Job 会一并取消。")) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/runs/${record.run.id}/cancel`, {
        method: "POST",
        headers: await adminBrowserMutationHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          expectedUpdatedAt: record.run.updatedAt,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      });
      const body = (await response.json()) as {
        run?: ExecutionRunRecord;
        error?: { message?: string };
      };
      if (!response.ok || !body.run) {
        throw new Error(body.error?.message ?? "Unable to cancel run");
      }
      setRecord(body.run);
      setSuccess("待运行记录及其 PENDING Job 已取消。");
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Unable to cancel run");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        正在读取 Execution Ledger…
      </div>
    );
  }

  if (!record) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        {error ?? "运行记录不存在。"}
      </div>
    );
  }

  const run = record.run;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/runs"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft size={17} aria-hidden="true" /> 返回运行记录
        </Link>
        {run.status === "PENDING" ? (
          <button
            type="button"
            disabled={saving}
            onClick={cancel}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-300 px-4 py-2.5 text-sm font-medium text-rose-700 disabled:opacity-50"
          >
            <Ban size={17} aria-hidden="true" /> 取消待运行任务
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {success}
        </div>
      ) : null}

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        该记录保留不可变派发快照。PENDING 表示等待 Worker，LEASED 表示仅完成任务保留； RUNNING
        之后的状态必须由持有 Worker 凭证和 Lease Token 的执行端写入。当前阶段只提供 metadata-only
        Fixture runtime，不产生 RawArtifact，也不调用 Crawl4AI。
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              CollectionRun
            </p>
            <h2 className="mt-2 text-lg font-semibold text-slate-950">{run.id}</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
            {run.status}
          </span>
        </div>
        <dl className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="计划" value={run.planSnapshot.name} />
          <Field label="数据源" value={run.sourceSnapshot.name} />
          <Field
            label="Connector"
            value={`${run.connectorSnapshot.connectorId}@${run.connectorSnapshot.version}`}
          />
          <Field label="触发方式" value={run.trigger.type} />
          <Field label="请求者" value={run.trigger.requestedBy.actorType} />
          <Field label="请求时间" value={new Date(run.requestedAt).toLocaleString("zh-CN")} />
          <Field label="更新时间" value={new Date(run.updatedAt).toLocaleString("zh-CN")} />
          <Field label="Idempotency" value={run.trigger.idempotencyKey ?? "—"} />
        </dl>
        {run.cancellationReason ? (
          <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
            取消原因：{run.cancellationReason}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-950">Job attempts</h2>
          <p className="mt-1 text-sm text-slate-500">
            Job 状态由派发、租约和受控 Worker Execution Protocol 共同推进。
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Job ID</th>
                <th className="px-5 py-3 font-medium">类型</th>
                <th className="px-5 py-3 font-medium">Attempt</th>
                <th className="px-5 py-3 font-medium">Available</th>
                <th className="px-5 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {record.jobs.map((job) => (
                <tr key={job.id}>
                  <td className="px-5 py-4 font-medium text-slate-950">{job.id}</td>
                  <td className="px-5 py-4 text-slate-700">{job.jobType}</td>
                  <td className="px-5 py-4 text-slate-700">
                    {job.attempt} / {job.maxAttempts}
                  </td>
                  <td className="px-5 py-4 text-slate-500">
                    {new Date(job.availableAt).toLocaleString("zh-CN")}
                  </td>
                  <td className="px-5 py-4 text-slate-700">{job.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <Snapshot title="Plan snapshot" value={run.planSnapshot} />
        <Snapshot title="Source snapshot" value={run.sourceSnapshot} />
        <Snapshot title="Connector snapshot" value={run.connectorSnapshot} />
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-slate-900">{value}</dd>
    </div>
  );
}

function Snapshot({ title, value }: { title: string; value: unknown }) {
  return (
    <details className="rounded-2xl border border-slate-200 bg-white p-5">
      <summary className="flex cursor-pointer items-center gap-2 font-semibold text-slate-950">
        <Clock3 size={17} aria-hidden="true" /> {title}
      </summary>
      <pre className="mt-4 max-h-[420px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
