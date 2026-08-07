"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarClock, Plus } from "lucide-react";
import type { SourceDefinition } from "@markorbit/contracts";
import type { CollectionPlanRegistryRecord } from "@markorbit/persistence/collection-plans";

export function SourcePlansPanel({ sourceId }: { sourceId: string }) {
  const [source, setSource] = useState<SourceDefinition | null>(null);
  const [plans, setPlans] = useState<CollectionPlanRegistryRecord[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(`/api/sources/${sourceId}`, { signal: controller.signal }).then(async (response) => {
        const body = (await response.json()) as {
          source?: SourceDefinition;
          error?: { message?: string };
        };
        if (!response.ok || !body.source) {
          throw new Error(body.error?.message ?? "Unable to load source");
        }
        return body.source;
      }),
      fetch(`/api/sources/${sourceId}/plans`, { signal: controller.signal }).then(
        async (response) => {
          const body = (await response.json()) as {
            items?: CollectionPlanRegistryRecord[];
            error?: { message?: string };
          };
          if (!response.ok) throw new Error(body.error?.message ?? "Unable to load plans");
          return body.items ?? [];
        },
      ),
    ])
      .then(([sourceValue, planItems]) => {
        setSource(sourceValue);
        setPlans(planItems);
        setSelected(sourceValue.defaultCollectionPlanId ?? "");
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load plans");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [sourceId]);

  async function saveDefault() {
    if (!source) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/sources/${sourceId}/default-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: selected || null,
          expectedUpdatedAt: source.updatedAt,
        }),
      });
      const body = (await response.json()) as {
        source?: SourceDefinition;
        error?: { message?: string };
      };
      if (!response.ok || !body.source) {
        throw new Error(body.error?.message ?? "Unable to set default collection plan");
      }
      setSource(body.source);
      setSelected(body.source.defaultCollectionPlanId ?? "");
      setSuccess("默认采集计划已更新。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save default plan");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        正在读取该数据源的采集计划…
      </section>
    );
  }

  const selectablePlans = plans.filter((record) => record.plan.status !== "ARCHIVED");

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-950">采集计划</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            计划属于当前数据源。默认计划只表示首选采集策略，不会触发自动执行。
          </p>
        </div>
        <Link
          href="/jobs/new"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700"
        >
          <Plus size={17} aria-hidden="true" /> 新建计划
        </Link>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {success}
        </div>
      ) : null}

      {plans.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center">
          <CalendarClock className="mx-auto text-slate-400" size={28} aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-slate-800">该数据源尚无采集计划</p>
          <p className="mt-1 text-xs text-slate-500">先创建暂停状态的计划，确认策略后再启用。</p>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">计划</th>
                <th className="px-4 py-3 font-medium">方式</th>
                <th className="px-4 py-3 font-medium">优先级</th>
                <th className="px-4 py-3 font-medium">输出</th>
                <th className="px-4 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plans.map((record) => (
                <tr key={record.plan.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/jobs/${record.plan.id}`}
                      className="font-medium text-slate-950 hover:text-emerald-700"
                    >
                      {record.plan.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{record.plan.schedule.mode}</td>
                  <td className="px-4 py-3 text-slate-600">{record.plan.priority}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {record.plan.output.artifactKinds.join(", ")}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{record.plan.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="text-sm font-medium text-slate-800">默认采集计划</span>
          <select
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            <option value="">不设置默认计划</option>
            {selectablePlans.map((record) => (
              <option key={record.plan.id} value={record.plan.id}>
                {record.plan.name} · {record.plan.status}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={saving || !source}
          onClick={saveDefault}
          className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存默认计划"}
        </button>
      </div>
    </section>
  );
}
