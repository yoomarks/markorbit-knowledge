"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Database, Globe2, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { useAdminI18n } from "@/lib/i18n";

type SupplyCoverageItem = {
  jurisdiction: string;
  targetCount: number;
  registeredTargetCount: number;
  activatedTargetCount: number;
  supply: {
    healthy: number;
    degraded: number;
    blocked: number;
    stale: number;
    healthyPercent: number | null;
  };
};

type SupplyCoverageResponse = {
  items: SupplyCoverageItem[];
  summary: {
    curatedJurisdictionCount: number;
    fullyCoveredCount: number;
    fullyHealthyCount: number;
    supplyAttentionCount: number;
  };
};

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

function percent(value: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((value / total) * 100)}%`;
}

export function SourceSupplyCoverage({ workspaceId }: { workspaceId: string }) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const [result, setResult] = useState<SupplyCoverageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/sources/coverage?workspaceId=${encodeURIComponent(workspaceId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(await readError(response));
      setResult((await response.json()) as SupplyCoverageResponse);
      setError(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : zh
            ? "无法加载知识供应状态"
            : "Unable to load knowledge supply status",
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId, zh]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const totals = useMemo(() => {
    const curated = (result?.items ?? []).filter((item) => item.targetCount > 0);
    return curated.reduce(
      (current, item) => ({
        catalog: current.catalog + item.targetCount,
        registered: current.registered + item.registeredTargetCount,
        activated: current.activated + item.activatedTargetCount,
        healthy: current.healthy + item.supply.healthy,
        degraded: current.degraded + item.supply.degraded,
        blocked: current.blocked + item.supply.blocked,
        stale: current.stale + item.supply.stale,
      }),
      { catalog: 0, registered: 0, activated: 0, healthy: 0, degraded: 0, blocked: 0, stale: 0 },
    );
  }, [result]);

  const attention = useMemo(
    () =>
      (result?.items ?? [])
        .filter((item) => item.targetCount > 0 && item.supply.healthy < item.targetCount)
        .sort((left, right) => {
          const leftPercent = left.supply.healthyPercent ?? -1;
          const rightPercent = right.supply.healthyPercent ?? -1;
          if (leftPercent !== rightPercent) return leftPercent - rightPercent;
          return left.jurisdiction.localeCompare(right.jurisdiction);
        })
        .slice(0, 8),
    [result],
  );

  if (loading && !result) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        <Loader2 className="mx-auto mb-3 animate-spin text-blue-600" size={22} />
        {zh ? "正在计算全球知识供应状态…" : "Calculating global knowledge supply health…"}
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/30">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div>
          <div className="flex items-center gap-2">
            <Activity size={19} className="text-blue-600" />
            <h2 className="font-semibold text-slate-950">
              {zh ? "全球知识供应 / Knowledge Supply" : "Knowledge Supply / 全球知识供应"}
            </h2>
          </div>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
            {zh
              ? "把目录覆盖、来源激活和真实供应健康分开衡量。Healthy 只有在来源已启用，并持续产生可追溯、已规范化且可检索的最新资料时才成立。"
              : "Separate catalog coverage, source activation, and actual supply health. Healthy requires an enabled source with fresh, traceable, normalized, retrievable evidence."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          {zh ? "刷新" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
        {[
          {
            label: zh ? "目录目标" : "Catalog targets",
            value: totals.catalog,
            detail: `${result?.summary.curatedJurisdictionCount ?? 0} ${zh ? "个国家/地区" : "jurisdictions"}`,
            icon: Globe2,
          },
          {
            label: zh ? "已登记来源" : "Registered",
            value: totals.registered,
            detail: percent(totals.registered, totals.catalog),
            icon: Database,
          },
          {
            label: zh ? "已激活供应" : "Activated",
            value: totals.activated,
            detail: percent(totals.activated, totals.catalog),
            icon: Activity,
          },
          {
            label: zh ? "健康供应" : "Healthy supply",
            value: totals.healthy,
            detail: percent(totals.healthy, totals.catalog),
            icon: ShieldAlert,
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-slate-500">{card.label}</p>
                <Icon size={16} className="text-slate-400" />
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{card.value}</p>
              <p className="mt-1 text-xs text-slate-500">{card.detail}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 border-t border-slate-200 p-5 sm:p-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            {zh ? "供应缺口" : "Supply gaps"}
          </h3>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-700">{zh ? "降级" : "Degraded"}</p>
              <p className="mt-1 text-xl font-semibold text-amber-900">{totals.degraded}</p>
            </div>
            <div className="rounded-xl bg-rose-50 p-3">
              <p className="text-xs font-medium text-rose-700">{zh ? "阻塞" : "Blocked"}</p>
              <p className="mt-1 text-xl font-semibold text-rose-900">{totals.blocked}</p>
            </div>
            <div className="rounded-xl bg-slate-100 p-3">
              <p className="text-xs font-medium text-slate-600">{zh ? "过期" : "Stale"}</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{totals.stale}</p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            {zh
              ? `${result?.summary.fullyHealthyCount ?? 0} 个国家/地区当前实现全量健康供应；${result?.summary.supplyAttentionCount ?? 0} 个仍需要激活或修复。`
              : `${result?.summary.fullyHealthyCount ?? 0} jurisdictions are fully healthy; ${result?.summary.supplyAttentionCount ?? 0} still need activation or remediation.`}
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            {zh ? "优先处理国家 / 地区" : "Jurisdictions needing attention"}
          </h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {attention.map((item) => (
              <div key={item.jurisdiction} className="rounded-xl border border-slate-200 px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-900">{item.jurisdiction}</span>
                  <span className="text-xs font-semibold text-blue-700">
                    {item.supply.healthy}/{item.targetCount}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  {zh ? "激活" : "Activated"} {item.activatedTargetCount}/{item.targetCount} · {zh ? "降级" : "Degraded"} {item.supply.degraded} · {zh ? "阻塞" : "Blocked"} {item.supply.blocked}
                </p>
              </div>
            ))}
            {attention.length === 0 ? (
              <p className="text-sm text-emerald-700">
                {zh ? "当前所有目录辖区均为健康供应。" : "All catalog jurisdictions are healthy."}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
