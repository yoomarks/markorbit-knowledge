"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PlayCircle, RefreshCw } from "lucide-react";
import type { CollectionPlanRegistryRecord } from "@markorbit/persistence/collection-plans";
import type {
  ExecutionRunRecord,
  ManualDispatchResult,
} from "@markorbit/persistence/execution-ledger";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";

export function PlanRunsPanel({ planId }: { planId: string }) {
  const [plan, setPlan] = useState<CollectionPlanRegistryRecord | null>(null);
  const [runs, setRuns] = useState<ExecutionRunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(`/api/plans/${planId}`, { signal: controller.signal }),
      fetch(`/api/plans/${planId}/runs?limit=10`, { signal: controller.signal }),
    ])
      .then(async ([planResponse, runsResponse]) => {
        const planBody = (await planResponse.json()) as {
          plan?: CollectionPlanRegistryRecord;
          error?: { message?: string };
        };
        const runsBody = (await runsResponse.json()) as {
          runs?: ExecutionRunRecord[];
          error?: { message?: string };
        };
        if (!planResponse.ok || !planBody.plan) {
          throw new Error(planBody.error?.message ?? "Unable to load plan");
        }
        if (!runsResponse.ok || !runsBody.runs) {
          throw new Error(runsBody.error?.message ?? "Unable to load plan runs");
        }
        setPlan(planBody.plan);
        setRuns(runsBody.runs);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load runs");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [planId]);

  async function dispatch() {
    if (!plan || plan.plan.status !== "ACTIVE") return;
    if (
      !window.confirm(
        "确认创建手动运行记录？系统只会写入 PENDING CollectionRun 与 Job，当前不会运行 Crawl4AI。",
      )
    ) {
      return;
    }
    setDispatching(true);
    setError(null);
    setSuccess(null);
    try {
      const idempotencyKey = `manual-${plan.plan.id}-${crypto.randomUUID()}`;
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: await adminBrowserMutationHeaders({
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        }),
        body: JSON.stringify({ planId: plan.plan.id }),
      });
      const body = (await response.json()) as
        ManualDispatchResult | { error?: { message?: string } };
      if (!response.ok || !("record" in body)) {
        const message = "error" in body ? body.error?.message : undefined;
        throw new Error(message ?? "Unable to dispatch run");
      }
      setRuns((current) => [
        body.record,
        ...current.filter((item) => item.run.id !== body.record.run.id),
      ]);
      setSuccess(`已创建待运行记录 ${body.record.run.id}。当前状态为 PENDING / Awaiting Worker。`);
    } catch (dispatchError) {
      setError(dispatchError instanceof Error ? dispatchError.message : "Unable to dispatch run");
    } finally {
      setDispatching(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="font-semibold text-slate-950">运行记录与手动派发</h2>
          <p className="mt-1 text-sm text-slate-500">
            创建不可变派发快照和 PENDING Job；Worker 与 Crawl4AI 执行仍未启用。
          </p>
        </div>
        <button
          type="button"
          onClick={dispatch}
          disabled={loading || dispatching || plan?.plan.status !== "ACTIVE"}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <PlayCircle size={17} aria-hidden="true" />
          {dispatching ? "正在创建…" : "立即创建运行记录"}
        </button>
      </div>

      {plan && plan.plan.status !== "ACTIVE" ? (
        <div className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-900">
          只有 ACTIVE 采集计划可以创建运行记录。请先完成兼容性校验并启用该计划。
        </div>
      ) : null}
      {error ? (
        <div className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="m-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {success}
        </div>
      ) : null}

      {loading ? (
        <div className="px-6 py-10 text-center text-sm text-slate-500">
          <RefreshCw className="mx-auto mb-3 animate-spin" size={20} aria-hidden="true" />
          正在读取最近运行记录…
        </div>
      ) : runs.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-slate-500">该计划尚无运行记录。</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">运行 ID</th>
                <th className="px-5 py-3 font-medium">Job 类型</th>
                <th className="px-5 py-3 font-medium">请求时间</th>
                <th className="px-5 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {runs.map((record) => (
                <tr key={record.run.id}>
                  <td className="px-5 py-4">
                    <Link
                      href={`/runs/${record.run.id}`}
                      className="font-medium text-slate-950 hover:text-emerald-700"
                    >
                      {record.run.id}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-slate-700">{record.jobs[0]?.jobType ?? "—"}</td>
                  <td className="px-5 py-4 text-slate-500">
                    {new Date(record.run.requestedAt).toLocaleString("zh-CN")}
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    {record.run.status}
                    {record.run.status === "PENDING" ? (
                      <span className="ml-2 text-xs text-slate-500">Awaiting Worker</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
