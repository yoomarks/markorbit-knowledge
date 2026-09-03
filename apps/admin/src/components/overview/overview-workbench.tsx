"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  Globe2,
  Loader2,
  PackageCheck,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { useAdminI18n } from "@/lib/i18n";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";

type CandidateRecord = {
  candidate: {
    candidateId: string;
    locator: string;
    title?: string;
    discoveredAt: string;
    status: "DISCOVERED" | "REVIEWED" | "ACCEPTED" | "REJECTED";
  };
};

type DiscoveryOverview = {
  candidates: {
    total: number;
    items?: CandidateRecord[];
    summary: {
      DISCOVERED: number;
      REVIEWED: number;
      ACCEPTED: number;
      REJECTED: number;
      total: number;
    };
  };
};

type KnowledgeResponse = {
  total: number;
  summary: { total: number; ready: number; generated: number; blocked: number; archived: number };
  items: Array<{
    id: string;
    title: string;
    status: string;
    generatedAt: string;
    source: { name: string; jurisdictions: string[] } | null;
  }>;
};

type ReadyPackage = {
  id: string;
  status: "CREATED" | "VERIFIED" | "HANDED_OFF";
  createdAt: string;
  evidence: { sourceId?: string };
};

type OperationsIssue = {
  code: string;
  severity: "ACTION" | "DEGRADED" | "BLOCKED";
  count: number;
  message: string;
  recommendedAction: string;
  href: string;
};

type OperationsReadiness = {
  observedAt: string;
  state: "READY" | "DEGRADED" | "BLOCKED";
  metrics: {
    sources: { total: number; active: number; error: number };
    workers: { total: number; online: number; busy: number; offline: number; error: number };
    collection: { failedRuns24h: number; jobsFailed24h: number; jobsDeadLetter: number };
    conversion: { failed24h: number; stalled: number };
    scheduler: { errors: number; overdue: number };
    readyPackages: { verified: number; withoutSubmission: number };
  };
  issues: OperationsIssue[];
};

type CoverageItem = {
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

type CoverageResponse = {
  items: CoverageItem[];
  summary: {
    curatedJurisdictionCount: number;
    fullyCoveredCount: number;
    fullyHealthyCount: number;
    supplyAttentionCount: number;
  };
};

type DashboardState = {
  discovery: DiscoveryOverview;
  knowledge: KnowledgeResponse;
  packages: ReadyPackage[];
  operations: OperationsReadiness;
  coverage: CoverageResponse;
};

type ActionItem = {
  key: string;
  severity: "ACTION" | "DEGRADED" | "BLOCKED";
  count: number;
  title: string;
  message: string;
  action: string;
  href: string;
};

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

function candidateTitle(record: CandidateRecord): string {
  if (record.candidate.title?.trim()) return record.candidate.title.trim();
  try {
    const url = new URL(record.candidate.locator);
    const last = decodeURIComponent(url.pathname).split("/").filter(Boolean).at(-1);
    return last?.replace(/[-_]+/g, " ") || url.hostname;
  } catch {
    return record.candidate.locator;
  }
}

function severityRank(severity: ActionItem["severity"]): number {
  return severity === "BLOCKED" ? 0 : severity === "DEGRADED" ? 1 : 2;
}

function severityTone(severity: ActionItem["severity"]): string {
  if (severity === "BLOCKED") return "border-rose-200 bg-rose-50 text-rose-700";
  if (severity === "DEGRADED") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function statusTone(state: OperationsReadiness["state"]): string {
  if (state === "BLOCKED") return "bg-rose-50 text-rose-700";
  if (state === "DEGRADED") return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
}

export function OverviewWorkbench({ workspaceId }: { workspaceId: string }) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const [state, setState] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [
        discoveryResponse,
        knowledgeResponse,
        packagesResponse,
        operationsResponse,
        coverageResponse,
      ] = await Promise.all([
        fetch("/api/discovery", { cache: "no-store" }),
        fetch(`/api/knowledge?workspaceId=${encodeURIComponent(workspaceId)}&limit=5`, {
          cache: "no-store",
        }),
        fetch(`/api/ready-packages?workspaceId=${encodeURIComponent(workspaceId)}`, {
          cache: "no-store",
        }),
        fetch(`/api/operations/readiness?workspaceId=${encodeURIComponent(workspaceId)}`, {
          cache: "no-store",
        }),
        fetch(`/api/sources/coverage?workspaceId=${encodeURIComponent(workspaceId)}`, {
          cache: "no-store",
        }),
      ]);
      for (const response of [
        discoveryResponse,
        knowledgeResponse,
        packagesResponse,
        operationsResponse,
        coverageResponse,
      ]) {
        if (!response.ok) throw new Error(await readError(response));
      }
      const packagesBody = (await packagesResponse.json()) as { readyPackages: ReadyPackage[] };
      setState({
        discovery: (await discoveryResponse.json()) as DiscoveryOverview,
        knowledge: (await knowledgeResponse.json()) as KnowledgeResponse,
        packages: packagesBody.readyPackages,
        operations: (await operationsResponse.json()) as OperationsReadiness,
        coverage: (await coverageResponse.json()) as CoverageResponse,
      });
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load overview");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function review(candidateId: string, decision: "ACCEPTED" | "REJECTED") {
    setWorkingId(candidateId);
    setError(null);
    try {
      const response = await fetch("/api/discovery/reviews", {
        method: "POST",
        headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          candidateIds: [candidateId],
          decision,
          startCollection: decision === "ACCEPTED",
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      await refresh();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Unable to review source");
    } finally {
      setWorkingId(null);
    }
  }

  const pendingReview = useMemo(
    () =>
      (state?.discovery.candidates.summary.DISCOVERED ?? 0) +
      (state?.discovery.candidates.summary.REVIEWED ?? 0),
    [state],
  );

  const pendingCandidates = useMemo(
    () =>
      (state?.discovery.candidates.items ?? [])
        .filter(
          (record) =>
            record.candidate.status === "DISCOVERED" || record.candidate.status === "REVIEWED",
        )
        .slice(0, 4),
    [state],
  );

  const supply = useMemo(
    () =>
      (state?.coverage.items ?? [])
        .filter((item) => item.targetCount > 0)
        .reduce(
          (current, item) => ({
            targets: current.targets + item.targetCount,
            registered: current.registered + item.registeredTargetCount,
            activated: current.activated + item.activatedTargetCount,
            healthy: current.healthy + item.supply.healthy,
            degraded: current.degraded + item.supply.degraded,
            blocked: current.blocked + item.supply.blocked,
            stale: current.stale + item.supply.stale,
          }),
          {
            targets: 0,
            registered: 0,
            activated: 0,
            healthy: 0,
            degraded: 0,
            blocked: 0,
            stale: 0,
          },
        ),
    [state],
  );

  const actionItems = useMemo(() => {
    const items: ActionItem[] = [];
    if (supply.blocked > 0) {
      items.push({
        key: "SUPPLY_BLOCKED",
        severity: "BLOCKED",
        count: supply.blocked,
        title: zh ? "知识供应被阻塞" : "Knowledge supply blocked",
        message: zh
          ? "部分目录目标尚未形成可用供应，可能缺少来源、采集证据、规范化结果或检索文档。"
          : "Some catalog targets do not yet have usable supply because source, acquisition, normalization, or retrieval evidence is missing.",
        action: zh ? "打开 Sources 查看缺口" : "Open Sources to inspect gaps",
        href: "/sources",
      });
    }
    if (supply.degraded > 0) {
      items.push({
        key: "SUPPLY_DEGRADED",
        severity: "DEGRADED",
        count: supply.degraded,
        title: zh ? "知识供应已降级" : "Knowledge supply degraded",
        message: zh
          ? "来源已经产生证据，但仍存在失败、过期、规范化或检索链路问题。"
          : "Evidence exists, but failures, staleness, normalization, or retrieval gaps remain.",
        action: zh ? "查看供应健康" : "Inspect supply health",
        href: "/sources",
      });
    }
    if (supply.stale > 0) {
      items.push({
        key: "SUPPLY_STALE",
        severity: "DEGRADED",
        count: supply.stale,
        title: zh ? "来源资料已过期" : "Source evidence is stale",
        message: zh
          ? "部分来源超过其变化敏感度对应的最大资料年龄，需要重新采集或检查调度。"
          : "Some sources exceed the maximum evidence age for their change sensitivity and need recollection or scheduler review.",
        action: zh ? "检查 Sources 与采集计划" : "Review Sources and collection plans",
        href: "/sources",
      });
    }
    for (const issue of state?.operations.issues ?? []) {
      items.push({
        key: `OPS_${issue.code}`,
        severity: issue.severity,
        count: issue.count,
        title: issue.code.replaceAll("_", " "),
        message: issue.message,
        action: issue.recommendedAction,
        href: issue.href,
      });
    }
    if (pendingReview > 0) {
      items.push({
        key: "DISCOVERY_REVIEW",
        severity: "ACTION",
        count: pendingReview,
        title: zh ? "候选来源等待审批" : "Source candidates awaiting review",
        message: zh
          ? "Discovery 已发现新的候选来源，采集不会在人工批准前自动启动。"
          : "Discovery found new candidates; collection will not start until explicit human approval.",
        action: zh ? "审查候选来源" : "Review source candidates",
        href: "/sources",
      });
    }
    return items.sort(
      (left, right) =>
        severityRank(left.severity) - severityRank(right.severity) || right.count - left.count,
    );
  }, [pendingReview, state, supply, zh]);

  const attentionJurisdictions = useMemo(
    () =>
      (state?.coverage.items ?? [])
        .filter((item) => item.targetCount > 0 && item.supply.healthy < item.targetCount)
        .sort((left, right) => {
          const leftPercent = left.supply.healthyPercent ?? -1;
          const rightPercent = right.supply.healthyPercent ?? -1;
          if (leftPercent !== rightPercent) return leftPercent - rightPercent;
          return left.jurisdiction.localeCompare(right.jurisdiction);
        })
        .slice(0, 6),
    [state],
  );

  if (loading && !state) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-sm text-slate-500 shadow-sm">
        <Loader2 className="mx-auto mb-3 animate-spin text-blue-600" size={22} />
        {zh ? "正在汇总知识运营状态…" : "Loading knowledge operations…"}
      </div>
    );
  }

  const systemState = state?.operations.state ?? "READY";
  const verifiedPackages = state?.packages.filter((item) => item.status === "VERIFIED").length ?? 0;
  const cards = [
    {
      label: zh ? "系统运行状态" : "System readiness",
      value: systemState,
      hint: `${state?.operations.issues.length ?? 0} ${zh ? "类运行事项" : "operational issues"}`,
      icon: systemState === "READY" ? ShieldCheck : ShieldAlert,
      tone: statusTone(systemState),
    },
    {
      label: zh ? "健康知识供应" : "Healthy supply",
      value: `${supply.healthy}/${supply.targets}`,
      hint: `${supply.activated}/${supply.targets} ${zh ? "已激活" : "activated"}`,
      icon: Activity,
      tone: supply.blocked > 0 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700",
    },
    {
      label: zh ? "待处理事项" : "Needs attention",
      value: actionItems.length,
      hint: `${actionItems.filter((item) => item.severity === "BLOCKED").length} blocked · ${actionItems.filter((item) => item.severity === "DEGRADED").length} degraded`,
      icon: AlertTriangle,
      tone: actionItems.some((item) => item.severity === "BLOCKED")
        ? "bg-rose-50 text-rose-700"
        : "bg-amber-50 text-amber-700",
    },
    {
      label: zh ? "待审查 / 待交付" : "Review / delivery",
      value: `${pendingReview} / ${verifiedPackages}`,
      hint: zh ? "候选来源 / 就绪交付包" : "source reviews / ready packages",
      icon: Clock3,
      tone: "bg-blue-50 text-blue-700",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-slate-400">
            MarkOrbit Knowledge
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-[28px]">
            {zh ? "知识运营中心 / Knowledge Operations" : "Knowledge Operations / 知识运营中心"}
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            {zh
              ? "先处理异常，再扩展供应。首页只突出今天需要行动的知识运营事项。"
              : "Fix operational gaps before expanding supply. The overview prioritizes what needs action now."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50 sm:self-auto"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          {zh ? "刷新 Refresh" : "Refresh 刷新"}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((item) => {
          const Icon = item.icon;
          return (
            <section
              key={item.label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40"
            >
              <div className="flex items-start justify-between gap-3">
                <span className={`grid size-10 place-items-center rounded-xl ${item.tone}`}>
                  <Icon size={20} />
                </span>
                <span className="rounded-full bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-400">
                  Live
                </span>
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-800">{item.label}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                {item.value}
              </p>
              <p className="mt-1 text-xs text-slate-400">{item.hint}</p>
            </section>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/30">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                {zh ? "运营行动队列 / Operations Queue" : "Operations Queue / 运营行动队列"}
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                {zh
                  ? "按 Blocked → Degraded → Action 排序，直接进入真实处理入口。"
                  : "Prioritized Blocked → Degraded → Action with direct remediation links."}
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {actionItems.length}
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {actionItems.slice(0, 10).map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="group flex flex-col gap-3 px-5 py-4 transition hover:bg-slate-50 sm:flex-row sm:items-start"
              >
                <span
                  className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${severityTone(item.severity)}`}
                >
                  {item.severity} · {item.count}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{item.message}</p>
                  <p className="mt-1.5 text-xs font-medium text-blue-600">{item.action}</p>
                </div>
                <ArrowRight
                  size={16}
                  className="mt-1 hidden shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-500 sm:block"
                />
              </Link>
            ))}
            {actionItems.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <ShieldCheck className="mx-auto text-emerald-600" size={24} />
                <p className="mt-2 text-sm font-semibold text-emerald-700">
                  {zh ? "当前没有需要处理的运营事项。" : "No operational action is required."}
                </p>
              </div>
            ) : null}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/30">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                {zh ? "供应薄弱辖区" : "Supply attention"}
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                {zh ? "按健康供应比例从低到高。" : "Lowest healthy-supply ratio first."}
              </p>
            </div>
            <Link
              href="/sources"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              {zh ? "Sources →" : "Sources →"}
            </Link>
          </div>
          <div className="divide-y divide-slate-100 px-5">
            {attentionJurisdictions.map((item) => (
              <div key={item.jurisdiction} className="py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-900">{item.jurisdiction}</span>
                  <span className="text-xs font-semibold text-blue-700">
                    {item.supply.healthy}/{item.targetCount}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-600"
                    style={{ width: `${item.supply.healthyPercent ?? 0}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  {zh ? "激活" : "Activated"} {item.activatedTargetCount}/{item.targetCount} ·{" "}
                  {zh ? "降级" : "Degraded"} {item.supply.degraded} · {zh ? "阻塞" : "Blocked"}{" "}
                  {item.supply.blocked}
                </p>
              </div>
            ))}
            {attentionJurisdictions.length === 0 ? (
              <p className="py-8 text-center text-sm text-emerald-700">
                {zh ? "所有目录辖区当前均为健康供应。" : "All catalog jurisdictions are healthy."}
              </p>
            ) : null}
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/30">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                {zh ? "待审查来源 / Source Review" : "Source Review / 待审查来源"}
                <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-600">
                  {pendingReview}
                </span>
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                {zh
                  ? "人工批准仍是外部来源进入采集链路的授权边界。"
                  : "Human approval remains the authorization boundary for external collection."}
              </p>
            </div>
            <Link
              href="/sources"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              {zh ? "查看全部" : "View all"}
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {pendingCandidates.length > 0 ? (
              pendingCandidates.map((record) => {
                const id = record.candidate.candidateId;
                const busy = workingId === id;
                return (
                  <div
                    key={id}
                    className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
                        <Globe2 size={17} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {candidateTitle(record)}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-400">
                          {record.candidate.locator}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2 pl-12 sm:pl-0">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void review(id, "ACCEPTED")}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {busy ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Check size={13} />
                        )}
                        {zh ? "批准" : "Approve"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void review(id, "REJECTED")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <X size={13} /> {zh ? "淘汰" : "Reject"}
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-5 py-10 text-center text-sm text-slate-400">
                {zh ? "当前没有待审批来源。" : "No sources are waiting for review."}
              </div>
            )}
          </div>
        </section>

        <div className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/30">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-2">
                <BookOpen size={16} className="text-emerald-600" />
                <h2 className="text-sm font-semibold text-slate-900">
                  {zh ? "最近知识资产" : "Recent knowledge"}
                </h2>
              </div>
              <Link
                href="/knowledge"
                className="text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                {zh ? "查看全部" : "View all"}
              </Link>
            </div>
            <div className="divide-y divide-slate-100 px-5">
              {(state?.knowledge.items ?? []).slice(0, 4).map((item) => (
                <Link key={item.id} href="/knowledge" className="block py-3.5">
                  <p className="truncate text-sm font-medium text-slate-800">{item.title}</p>
                  <p className="mt-1 truncate text-[11px] text-slate-400">
                    {item.source?.jurisdictions.join(", ") || item.source?.name || item.status}
                  </p>
                </Link>
              ))}
              {(state?.knowledge.items ?? []).length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  {zh ? "暂无知识资产。" : "No knowledge assets yet."}
                </p>
              ) : null}
            </div>
          </section>

          <Link
            href="/packages"
            className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/30 transition hover:border-blue-200"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
              <PackageCheck size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">
                {zh ? "就绪交付包" : "Ready packages"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {verifiedPackages}{" "}
                {zh
                  ? "个已验证包等待后续交付动作"
                  : "verified packages available for delivery actions"}
              </p>
            </div>
            <ArrowRight size={17} className="text-slate-300" />
          </Link>
        </div>
      </div>
    </div>
  );
}
