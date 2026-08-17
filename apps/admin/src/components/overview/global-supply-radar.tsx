"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, ShieldAlert } from "lucide-react";
import { useMemo } from "react";
import { useAdminI18n } from "@/lib/i18n";
import {
  buildGlobalSupplyRadarRows,
  summarizeGlobalSupplyRadar,
  type GlobalSupplyRadarCoverageItem,
  type GlobalSupplyRadarStatus,
} from "./global-supply-radar-state";

type Props = {
  items: readonly GlobalSupplyRadarCoverageItem[];
};

const STATUS_RANK: Record<GlobalSupplyRadarStatus, number> = {
  BLOCKED: 0,
  DEGRADED: 1,
  UNAVAILABLE: 2,
  READY: 3,
};

function statusTone(status: GlobalSupplyRadarStatus): string {
  if (status === "READY") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "DEGRADED") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "BLOCKED") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-500";
}

function StatusIcon({ status }: { status: GlobalSupplyRadarStatus }) {
  if (status === "READY") return <CheckCircle2 size={15} aria-hidden="true" />;
  if (status === "DEGRADED") return <AlertTriangle size={15} aria-hidden="true" />;
  if (status === "BLOCKED") return <ShieldAlert size={15} aria-hidden="true" />;
  return <CircleDashed size={15} aria-hidden="true" />;
}

export function GlobalSupplyRadar({ items }: Props) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const rows = useMemo(
    () =>
      buildGlobalSupplyRadarRows(items).sort(
        (left, right) => STATUS_RANK[left.status] - STATUS_RANK[right.status],
      ),
    [items],
  );
  const summary = useMemo(() => summarizeGlobalSupplyRadar(rows), [rows]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/30">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            {zh ? "全球供应雷达 / Global Supply Radar" : "Global Supply Radar / 全球供应雷达"}
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            {zh
              ? "聚焦代表辖区的 Catalog → Activated → Healthy。可见性不等于写权限，状态来自真实供应健康数据。"
              : "Representative jurisdictions across Catalog → Activated → Healthy. Visibility does not grant write access; status comes from real supply-health data."}
          </p>
        </div>
        <Link
          href="/foundationalDiagnostics"
          className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
        >
          {zh ? "打开 Advanced" : "Open Advanced"} <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3 text-[11px] font-semibold">
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">
          READY {summary.READY}
        </span>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">
          DEGRADED {summary.DEGRADED}
        </span>
        <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-700">
          BLOCKED {summary.BLOCKED}
        </span>
        {summary.UNAVAILABLE > 0 ? (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-500">
            UNAVAILABLE {summary.UNAVAILABLE}
          </span>
        ) : null}
      </div>

      <div className="grid gap-px bg-slate-100 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <article key={row.code} className="bg-white px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-950">{row.code}</span>
                  <span className="truncate text-xs text-slate-400">{zh ? row.zh : row.en}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Catalog <strong className="font-semibold text-slate-700">{row.targetCount}</strong> ·{" "}
                  Activated <strong className="font-semibold text-slate-700">{row.activatedTargetCount}</strong> ·{" "}
                  Healthy <strong className="font-semibold text-slate-700">{row.healthyCount}</strong>
                </p>
                {row.degradedCount > 0 || row.blockedCount > 0 || row.staleCount > 0 ? (
                  <p className="mt-1 text-[11px] text-slate-400">
                    {row.blockedCount > 0 ? `Blocked ${row.blockedCount}` : null}
                    {row.blockedCount > 0 && (row.degradedCount > 0 || row.staleCount > 0) ? " · " : null}
                    {row.degradedCount > 0 ? `Degraded ${row.degradedCount}` : null}
                    {row.degradedCount > 0 && row.staleCount > 0 ? " · " : null}
                    {row.staleCount > 0 ? `Stale ${row.staleCount}` : null}
                  </p>
                ) : null}
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${statusTone(row.status)}`}
              >
                <StatusIcon status={row.status} /> {row.status}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
