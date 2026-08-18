import { AlertTriangle, ExternalLink, ShieldCheck } from "lucide-react";
import { readSourceCatalogVerificationHealth } from "@/server/source-catalog-verification-health";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function metricTone(kind: "fresh" | "stale" | "invalid"): string {
  if (kind === "fresh") return "bg-emerald-50 text-emerald-700";
  if (kind === "stale") return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
}

export function SourceCatalogVerificationHealth() {
  const health = readSourceCatalogVerificationHealth();
  const hasIntegrityDebt = health.duplicateTargetCount > 0 || health.missingEvidenceTargetCount > 0;
  const needsAttention = health.stale > 0 || health.invalid > 0 || hasIntegrityDebt;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div>
          <div className="flex items-center gap-2">
            {needsAttention ? (
              <AlertTriangle size={19} className="text-amber-600" />
            ) : (
              <ShieldCheck size={19} className="text-emerald-700" />
            )}
            <h2 className="font-semibold text-slate-950">
              目录核验健康度 / Catalog verification health
            </h2>
          </div>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
            这里衡量的是 Source Coverage Catalog 的证据核验新鲜度，不代表 Source
            在线状态、采集兼容性或 Supply Health。当前维护策略：超过 {health.maxAgeDays}{" "}
            天未重新核验即进入 stale 工作队列。
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
            needsAttention ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {health.freshnessPercent}% fresh
        </span>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4 sm:p-6">
        <Metric label="Fresh" value={health.fresh} total={health.total} tone="fresh" />
        <Metric label="Stale" value={health.stale} total={health.total} tone="stale" />
        <Metric label="Invalid" value={health.invalid} total={health.total} tone="invalid" />
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Verification window
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {formatDate(health.oldestVerifiedAt)} → {formatDate(health.latestVerifiedAt)}
          </p>
          <p className="mt-1 text-xs text-slate-500">{health.total} catalog targets</p>
        </div>
      </div>

      {hasIntegrityDebt ? (
        <div className="mx-5 mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:mx-6 sm:mb-6">
          Catalog integrity debt: {health.duplicateTargetCount} duplicate target id(s),{" "}
          {health.missingEvidenceTargetCount} target(s) without verification evidence URI.
        </div>
      ) : null}

      {health.debtQueue.length > 0 ? (
        <div className="border-t border-slate-100 px-5 py-4 sm:px-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Verification work queue</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {health.staleJurisdictionCount} stale jurisdiction(s) ·{" "}
                {health.invalidJurisdictionCount} invalid jurisdiction(s). Invalid metadata is
                listed before oldest stale evidence.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="pb-2 font-medium">State</th>
                  <th className="pb-2 font-medium">Jurisdiction</th>
                  <th className="pb-2 font-medium">Target</th>
                  <th className="pb-2 font-medium">Family / tier</th>
                  <th className="pb-2 font-medium">Verified</th>
                  <th className="pb-2 font-medium">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {health.debtQueue.map((item) => (
                  <tr key={item.targetId}>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                          item.state === "INVALID"
                            ? "bg-rose-50 text-rose-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {item.state}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 font-medium text-slate-800">{item.jurisdiction}</td>
                    <td className="py-2.5 pr-4">
                      <p className="font-medium text-slate-900">{item.displayName}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">{item.targetId}</p>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600">
                      {item.family} · {item.coverageTier}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600">
                      <p>{formatDate(item.verifiedAt)}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {item.ageDays === null ? "invalid/future" : `${item.ageDays} days ago`}
                      </p>
                    </td>
                    <td className="py-2.5">
                      <a
                        href={item.verificationEvidenceUri}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline"
                      >
                        Verify
                        <ExternalLink size={12} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="border-t border-slate-100 px-5 py-4 text-sm text-slate-600 sm:px-6">
          当前没有超过 {health.maxAgeDays} 天的核验债务，也没有非法 / 未来核验时间。
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "fresh" | "stale" | "invalid";
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${metricTone(tone)}`}>
          {total > 0 ? `${Math.round((value / total) * 100)}%` : "0%"}
        </span>
      </div>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}
