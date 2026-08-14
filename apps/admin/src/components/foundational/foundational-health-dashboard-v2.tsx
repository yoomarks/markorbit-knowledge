"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type { FoundationalReadinessTarget } from "@markorbit/worker-runtime/foundational-readiness";
import type { FoundationalRemediationQueueSnapshot } from "@markorbit/worker-runtime/foundational-remediation-snapshot";
import { useAdminI18n } from "@/lib/i18n";

type Jurisdiction = "US" | "WO" | "EU";
type StageState = "READY" | "ATTENTION" | "PENDING";

type ErrorEnvelope = {
  error?: { message?: string };
};

const JURISDICTIONS: Array<{ code: Jurisdiction; zh: string; en: string }> = [
  { code: "US", zh: "美国", en: "United States" },
  { code: "WO", zh: "WIPO", en: "WIPO" },
  { code: "EU", zh: "欧盟 / EUIPO", en: "European Union / EUIPO" },
];

const STAGE_RANK: Record<FoundationalReadinessTarget["stage"], number> = {
  REGISTER: 0,
  COLLECT: 1,
  INGEST: 2,
  CONVERT: 3,
  INDEX: 4,
  QUALITY: 5,
  RELEVANCE: 6,
  HEALTH: 7,
  READY: 8,
};

function isSnapshot(value: unknown): value is FoundationalRemediationQueueSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<FoundationalRemediationQueueSnapshot>;
  return (
    candidate.objectType === "FOUNDATIONAL_REMEDIATION_QUEUE_SNAPSHOT" &&
    typeof candidate.workspaceId === "string" &&
    typeof candidate.jurisdiction === "string" &&
    typeof candidate.observedAt === "string" &&
    typeof candidate.readiness === "object" &&
    candidate.readiness !== null
  );
}

async function requestSnapshot(
  workspaceId: string,
  jurisdiction: Jurisdiction,
): Promise<FoundationalRemediationQueueSnapshot> {
  const query = new URLSearchParams({ workspaceId, jurisdiction, topK: "5" });
  const response = await fetch(`/api/foundational/remediation-queue?${query.toString()}`, {
    cache: "no-store",
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message = (payload as ErrorEnvelope)?.error?.message;
    throw new Error(message || `HTTP ${response.status}`);
  }
  if (!isSnapshot(payload)) throw new Error("Invalid foundational health snapshot");
  return payload;
}

function targetLabel(targetId: string): string {
  const acronyms: Record<string, string> = {
    api: "API",
    csv: "CSV",
    euipo: "EUIPO",
    gazette: "Gazette",
    madrid: "Madrid",
    pdf: "PDF",
    sme: "SME",
    tmep: "TMEP",
    ttab: "TTAB",
    uspto: "USPTO",
    wipo: "WIPO",
  };
  const tokens = targetId
    .replace(/^(us|wo|eu)-/i, "")
    .split(/[-_]/)
    .filter(Boolean);
  return tokens
    .map(
      (token) =>
        acronyms[token.toLowerCase()] ?? `${token[0]?.toUpperCase() ?? ""}${token.slice(1)}`,
    )
    .join(" ");
}

function stageState(
  target: FoundationalReadinessTarget,
  stage: "REGISTER" | "COLLECT" | "CONVERT" | "INDEX",
): StageState {
  const current = STAGE_RANK[target.stage];
  const required = STAGE_RANK[stage];
  if (current > required || target.stage === "READY") return "READY";
  if (current === required) return "ATTENTION";
  return "PENDING";
}

function retrievalState(target: FoundationalReadinessTarget): StageState {
  if (target.retrievalQualityState === "READY" && target.retrievalRelevanceState === "READY") {
    return "READY";
  }
  if (
    ["BLOCKED", "DEGRADED", "MISSING"].includes(target.retrievalQualityState) ||
    ["BLOCKED", "DEGRADED", "MISSING"].includes(target.retrievalRelevanceState)
  ) {
    return "ATTENTION";
  }
  return "PENDING";
}

function StageIndicator({ state, label }: { state: StageState; label: string }) {
  if (state === "READY") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 size={14} aria-hidden="true" /> {label}
      </span>
    );
  }
  if (state === "ATTENTION") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
        <AlertCircle size={14} aria-hidden="true" /> {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
      <CircleDashed size={14} aria-hidden="true" /> {label}
    </span>
  );
}

function issueLabel(target: FoundationalReadinessTarget, zh: boolean): string {
  const labels: Record<FoundationalReadinessTarget["stage"], [string, string]> = {
    REGISTER: ["来源尚未登记", "Source not registered"],
    COLLECT: ["需要采集或重新采集", "Collection required"],
    INGEST: ["采集完成但缺少原始证据", "Raw evidence missing after collection"],
    CONVERT: ["等待转换或转换异常", "Conversion required"],
    INDEX: ["需要入库或重新索引", "Indexing required"],
    QUALITY: ["检索结构质量需处理", "Retrieval quality needs attention"],
    RELEVANCE: ["检索冒烟验证需处理", "Retrieval smoke check needs attention"],
    HEALTH: ["供给链路健康异常", "Supply health needs attention"],
    READY: ["正常", "Healthy"],
  };
  return labels[target.stage][zh ? 0 : 1];
}

function statusLabel(state: FoundationalReadinessTarget["healthState"], zh: boolean): string {
  if (state === "READY") return zh ? "正常" : "Healthy";
  if (state === "DEGRADED") return zh ? "需关注" : "Degraded";
  if (state === "BLOCKED") return zh ? "阻塞" : "Blocked";
  return zh ? "未验证" : "Unverified";
}

function statusTone(state: FoundationalReadinessTarget["healthState"]): string {
  if (state === "READY") return "bg-emerald-50 text-emerald-700";
  if (state === "DEGRADED") return "bg-amber-50 text-amber-700";
  if (state === "BLOCKED") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-500";
}

function stageLabel(state: StageState, copy: { ready: string; action: string; pending: string }) {
  if (state === "READY") return copy.ready;
  if (state === "ATTENTION") return copy.action;
  return copy.pending;
}

export function FoundationalHealthDashboard({ workspaceId }: { workspaceId: string }) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const [snapshots, setSnapshots] = useState<
    Partial<Record<Jurisdiction, FoundationalRemediationQueueSnapshot>>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        JURISDICTIONS.map(
          async ({ code }) => [code, await requestSnapshot(workspaceId, code)] as const,
        ),
      );
      setSnapshots(
        Object.fromEntries(results) as Record<Jurisdiction, FoundationalRemediationQueueSnapshot>,
      );
      setError(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : zh
            ? "无法读取基础资料健康状态"
            : "Unable to load foundational health",
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId, zh]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const summary = useMemo(() => {
    const values = Object.values(snapshots);
    const total = values.reduce((sum, snapshot) => sum + snapshot.readiness.totalCount, 0);
    const ready = values.reduce((sum, snapshot) => sum + snapshot.readiness.readyCount, 0);
    const observedAt = values
      .map((snapshot) => snapshot.observedAt)
      .filter(Boolean)
      .sort()
      .at(-1);
    return {
      jurisdictions: values.length,
      total,
      ready,
      attention: Math.max(0, total - ready),
      observedAt,
    };
  }, [snapshots]);

  const copy = {
    jurisdictions: zh ? "覆盖机构" : "Jurisdictions",
    coverage: zh ? "基础资料覆盖" : "Foundational coverage",
    healthy: zh ? "正常来源" : "Healthy targets",
    attention: zh ? "需处理" : "Needs attention",
    lastCheck: zh ? "最近检查" : "Last checked",
    refresh: zh ? "刷新" : "Refresh",
    diagnostics: zh ? "高级技术诊断" : "Advanced diagnostics",
    source: zh ? "核心资料" : "Core source",
    register: zh ? "登记" : "Register",
    collect: zh ? "采集" : "Collect",
    convert: zh ? "转换" : "Convert",
    index: zh ? "入库" : "Index",
    retrieval: zh ? "检索" : "Retrieval",
    state: zh ? "状态" : "Status",
    issue: zh ? "当前问题" : "Current issue",
    ready: zh ? "正常" : "Ready",
    action: zh ? "待处理" : "Attention",
    pending: zh ? "待前序" : "Pending",
    loading: zh ? "正在读取基础资料健康状态…" : "Loading foundational health…",
    scopeNote: zh
      ? "这里只展示可操作的业务健康状态。审批角色、Mxx 阶段编号、显式派发、重建索引等工程操作已移到 Advanced。"
      : "This page shows operational health only. Approval actors, Mxx stage identifiers, explicit dispatch and reindex operations live under Advanced.",
    currentScope: zh
      ? "当前基础资料健康视图已覆盖美国、WIPO 与欧盟 EUIPO，并复用同一套可溯源供给健康模型。"
      : "The foundational health view now covers the United States, WIPO and EUIPO using the same provenance-aware supply-health model.",
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-950 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
          <div>
            <p>{copy.scopeNote}</p>
            <p className="mt-1 text-xs text-blue-700/80">{copy.currentScope}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-3.5 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-50 disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} aria-hidden="true" />
          {copy.refresh}
        </button>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          [copy.jurisdictions, summary.jurisdictions || JURISDICTIONS.length],
          [copy.coverage, `${summary.ready}/${summary.total}`],
          [copy.healthy, summary.ready],
          [copy.attention, summary.attention],
          [
            copy.lastCheck,
            summary.observedAt ? new Date(summary.observedAt).toLocaleString(locale) : "—",
          ],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-2 break-words text-xl font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      {loading && Object.keys(snapshots).length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          <Loader2
            className="mx-auto mb-3 animate-spin text-blue-600"
            size={22}
            aria-hidden="true"
          />
          {copy.loading}
        </div>
      ) : null}

      {JURISDICTIONS.map(({ code, zh: zhName, en }) => {
        const snapshot = snapshots[code];
        if (!snapshot) return null;
        const gate = snapshot.readiness;
        const title = zh ? zhName : en;
        const subtitle = zh ? en : zhName;
        return (
          <section
            key={code}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
          >
            <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
                  <span className="text-sm text-slate-400">{subtitle}</span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      gate.state === "READY"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {gate.state === "READY"
                      ? zh
                        ? "全部正常"
                        : "Healthy"
                      : zh
                        ? "需要处理"
                        : "Needs attention"}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-2 w-48 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{ width: `${Math.max(0, Math.min(100, gate.readyPercent))}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-slate-500">
                    {gate.readyCount}/{gate.totalCount} · {gate.readyPercent}%
                  </span>
                </div>
              </div>
              <Link
                href="/foundationalDiagnostics"
                className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-blue-600 hover:text-blue-700 sm:self-auto"
              >
                {copy.diagnostics} <ChevronRight size={15} aria-hidden="true" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">{copy.source}</th>
                    <th className="px-4 py-3 font-medium">{copy.register}</th>
                    <th className="px-4 py-3 font-medium">{copy.collect}</th>
                    <th className="px-4 py-3 font-medium">{copy.convert}</th>
                    <th className="px-4 py-3 font-medium">{copy.index}</th>
                    <th className="px-4 py-3 font-medium">{copy.retrieval}</th>
                    <th className="px-4 py-3 font-medium">{copy.state}</th>
                    <th className="px-5 py-3 font-medium">{copy.issue}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {gate.targets.map((target) => {
                    const registerState = stageState(target, "REGISTER");
                    const collectState = stageState(target, "COLLECT");
                    const convertState = stageState(target, "CONVERT");
                    const indexState = stageState(target, "INDEX");
                    const searchState = retrievalState(target);
                    return (
                      <tr key={target.targetId} className="hover:bg-slate-50/70">
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-900">{targetLabel(target.targetId)}</p>
                          <p className="mt-1 text-[11px] text-slate-400">{target.targetId}</p>
                        </td>
                        <td className="px-4 py-4">
                          <StageIndicator state={registerState} label={stageLabel(registerState, copy)} />
                        </td>
                        <td className="px-4 py-4">
                          <StageIndicator state={collectState} label={stageLabel(collectState, copy)} />
                        </td>
                        <td className="px-4 py-4">
                          <StageIndicator state={convertState} label={stageLabel(convertState, copy)} />
                        </td>
                        <td className="px-4 py-4">
                          <StageIndicator state={indexState} label={stageLabel(indexState, copy)} />
                        </td>
                        <td className="px-4 py-4">
                          <StageIndicator state={searchState} label={stageLabel(searchState, copy)} />
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(target.healthState)}`}
                          >
                            {statusLabel(target.healthState, zh)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-600">
                          {issueLabel(target, zh)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
