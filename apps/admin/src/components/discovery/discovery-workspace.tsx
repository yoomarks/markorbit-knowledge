"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  ExternalLink,
  Globe2,
  Loader2,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { PageHeading } from "../page-heading";

type CandidateStatus = "DISCOVERED" | "REVIEWED" | "ACCEPTED" | "REJECTED";

type CandidateRecord = {
  batchId: string;
  candidate: {
    candidateId: string;
    locator: string;
    discoveredAt: string;
    status: CandidateStatus;
    discoveredFrom?: string;
    depth?: number;
    metadata?: Record<string, unknown>;
  };
  firstSeenAt: string;
  lastSeenAt: string;
  review?: {
    decision: "ACCEPTED" | "REJECTED";
    reviewedAt: string;
    reviewer?: string;
    note?: string;
    acceptedSourceId?: string;
    collectionPlanId?: string;
  };
};

type DiscoveryOverview = {
  seeds: Array<{
    seedId: string;
    locator: string;
    status: "ACTIVE" | "ARCHIVED";
    createdAt: string;
    updatedAt: string;
  }>;
  batches: Array<{
    batch: {
      batchId: string;
      createdAt: string;
      seeds: Array<{ seedId: string; locator: string }>;
      constraints?: { maxDepth?: number; maxCandidates?: number };
    };
    status: "RUNNING" | "COMPLETED" | "FAILED";
    candidateCount: number;
    completedAt?: string;
    errorMessage?: string;
  }>;
  candidates: {
    items: CandidateRecord[];
    total: number;
    summary: Record<CandidateStatus, number> & { total: number };
  };
};

const emptyOverview: DiscoveryOverview = {
  seeds: [],
  batches: [],
  candidates: {
    items: [],
    total: 0,
    summary: {
      DISCOVERED: 0,
      REVIEWED: 0,
      ACCEPTED: 0,
      REJECTED: 0,
      total: 0,
    },
  },
};

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

function shortTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function candidateKind(record: CandidateRecord): string {
  const kind = record.candidate.metadata?.kind;
  return typeof kind === "string" ? kind : "PAGE";
}

export function DiscoveryWorkspace() {
  const [overview, setOverview] = useState<DiscoveryOverview>(emptyOverview);
  const [locator, setLocator] = useState("https://www.uspto.gov/");
  const [maxDepth, setMaxDepth] = useState(1);
  const [maxCandidates, setMaxCandidates] = useState(100);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [authorizingId, setAuthorizingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/discovery", { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response));
      setOverview((await response.json()) as DiscoveryOverview);
      setError(null);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error ? refreshError.message : "Failed to load discovery state",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    fetch("/api/discovery", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as DiscoveryOverview;
      })
      .then((data) => {
        if (!active) return;
        setOverview(data);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load discovery state");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function startDiscovery() {
    setRunning(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/discovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locator,
          maxDepth,
          maxCandidates,
          deniedUrlPatterns: ["/login", "/signin", "/logout"],
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as { candidates?: unknown[] };
      setMessage(`Discovery completed · ${result.candidates?.length ?? 0} candidates found`);
      await refresh();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Discovery failed");
    } finally {
      setRunning(false);
    }
  }

  async function review(candidateId: string, decision: "ACCEPTED" | "REJECTED") {
    setReviewingId(candidateId);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/discovery/candidates/${candidateId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, reviewer: "admin-console" }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setMessage(
        decision === "ACCEPTED"
          ? "Candidate accepted · Source and default Collection Plan created"
          : "Candidate rejected",
      );
      await refresh();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Review failed");
    } finally {
      setReviewingId(null);
    }
  }

  async function authorizeCollection(candidateId: string) {
    setAuthorizingId(candidateId);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(
        `/api/discovery/candidates/${candidateId}/authorize-collection`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ requestedBy: "admin-console" }),
        },
      );
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as { run: { id: string }; replayed: boolean };
      setMessage(
        result.replayed
          ? `Collection already authorized · existing run ${result.run.id}`
          : `Collection authorized · run ${result.run.id} queued for a compatible Worker`,
      );
      await refresh();
    } catch (authorizationError) {
      setError(
        authorizationError instanceof Error
          ? authorizationError.message
          : "Collection authorization failed",
      );
    } finally {
      setAuthorizingId(null);
    }
  }

  const pending = overview.candidates.items.filter(
    (record) => record.candidate.status === "DISCOVERED" || record.candidate.status === "REVIEWED",
  );
  const reviewed = overview.candidates.items.filter(
    (record) => record.candidate.status === "ACCEPTED" || record.candidate.status === "REJECTED",
  );

  return (
    <>
      <PageHeading
        title="Discovery"
        description="从 Seed 出发执行受控发现，持久化候选并由人工审核。Accept 只代表允许进入 Source / Collection，不代表法律事实或专业结论已经验证。"
        actions={
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={loading ? "animate-spin" : ""} size={16} /> Refresh
          </button>
        }
      />

      <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0" size={18} />
          <p>
            <strong>Live workflow：</strong> Seed、Discovery Batch、Candidate Review 已写入 SQLite。
            接受候选后自动创建 ACTIVE SourceDefinition 与一个 <strong>PAUSED</strong> 的默认
            Collection Plan；不会在没有进一步执行确认时自动抓取。
          </p>
        </div>
      </div>

      {error ? (
        <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {message}
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-slate-950 text-white">
              <Globe2 size={19} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-950">Start from a Seed</h2>
              <p className="mt-1 text-xs text-slate-500">
                当前生产保护：仅 http/https、公网目标、同域发现，最大深度 2、单次最多 500 个候选。
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <label className="text-xs font-medium text-slate-600" htmlFor="discovery-seed">
              Homepage / endpoint
            </label>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-3 text-slate-400" size={17} />
              <input
                id="discovery-seed"
                value={locator}
                onChange={(event) => setLocator(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 outline-none ring-0 focus:border-slate-400"
                placeholder="https://www.example.com/"
              />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-[160px_180px_1fr] sm:items-end">
              <label className="text-xs font-medium text-slate-600">
                Depth
                <select
                  value={maxDepth}
                  onChange={(event) => setMaxDepth(Number(event.target.value))}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                >
                  <option value={0}>0 · Seed only</option>
                  <option value={1}>1 · Recommended</option>
                  <option value={2}>2 · Deeper</option>
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">
                Candidate budget
                <select
                  value={maxCandidates}
                  onChange={(event) => setMaxCandidates(Number(event.target.value))}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                  <option value={500}>500</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => void startDiscovery()}
                disabled={running || locator.trim().length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white disabled:bg-slate-300"
              >
                {running ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                {running ? "Discovering…" : "Start Discovery"}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            {[
              [String(overview.seeds.length), "Seeds"],
              [String(overview.batches.length), "Recent batches"],
              [String(overview.candidates.summary.DISCOVERED), "Needs review"],
              [String(overview.candidates.summary.ACCEPTED), "Accepted"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-xl border border-slate-200 p-4">
                <p className="text-xl font-semibold text-slate-950">{value}</p>
                <p className="mt-1 text-xs text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-950">Recent batches</h2>
              <p className="mt-1 text-xs text-slate-500">
                每次 Discovery 的执行意图与结果数量均被持久化。
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              L1 Assisted
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {overview.batches.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                No discovery batches yet.
              </p>
            ) : (
              overview.batches.slice(0, 6).map((record) => (
                <div
                  key={record.batch.batchId}
                  className="rounded-xl border border-slate-100 px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {record.batch.seeds[0]?.locator ?? record.batch.batchId}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        record.status === "COMPLETED"
                          ? "bg-emerald-50 text-emerald-700"
                          : record.status === "FAILED"
                            ? "bg-rose-50 text-rose-700"
                            : "bg-blue-50 text-blue-700"
                      }`}
                    >
                      {record.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {record.candidateCount} candidates · depth{" "}
                    {record.batch.constraints?.maxDepth ?? 1} · {shortTime(record.batch.createdAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">Review Queue</h2>
            <p className="mt-1 text-xs text-slate-500">
              Accept = 允许进入 Source / Collection；Source authority 默认保持
              UNKNOWN，避免把采集接受误写成专业真值。
            </p>
          </div>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
            {pending.length} pending
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-slate-500">
            <Loader2 className="animate-spin" size={17} /> Loading persisted discovery state…
          </div>
        ) : pending.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            Review queue is empty. Start a discovery run to create candidates.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pending.map((record) => {
              const busy = reviewingId === record.candidate.candidateId;
              return (
                <div
                  key={record.candidate.candidateId}
                  className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="size-2 rounded-full bg-blue-500" />
                      <p className="max-w-full truncate text-sm font-semibold text-slate-900">
                        {record.candidate.locator}
                      </p>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                        {candidateKind(record)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      depth {record.candidate.depth ?? 0} · discovered{" "}
                      {shortTime(record.candidate.discoveredAt)}
                    </p>
                    {record.candidate.discoveredFrom ? (
                      <p className="mt-2 truncate text-xs text-slate-400">
                        from {record.candidate.discoveredFrom}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={record.candidate.locator}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600"
                    >
                      Inspect <ExternalLink size={13} />
                    </a>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void review(record.candidate.candidateId, "REJECTED")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 disabled:opacity-50"
                    >
                      <CircleAlert size={14} /> Reject
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void review(record.candidate.candidateId, "ACCEPTED")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-medium text-white disabled:bg-slate-300"
                    >
                      {busy ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}{" "}
                      Accept
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {reviewed.length > 0 ? (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold text-slate-950">Recently reviewed</h2>
            <p className="mt-1 text-xs text-slate-500">
              保留审核结果与 Source / Collection Plan 关联。
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {reviewed.slice(0, 12).map((record) => (
              <div
                key={record.candidate.candidateId}
                className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {record.candidate.locator}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {record.candidate.status} ·{" "}
                    {record.review ? shortTime(record.review.reviewedAt) : "reviewed"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {record.review?.acceptedSourceId ? (
                    <Link
                      href={`/sources/${record.review.acceptedSourceId}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-700"
                    >
                      Source <ArrowRight size={13} />
                    </Link>
                  ) : null}
                  {record.review?.collectionPlanId ? (
                    <Link href="/jobs" className="text-xs font-medium text-slate-600">
                      Collection plan: {record.review.collectionPlanId.slice(0, 12)}…
                    </Link>
                  ) : null}
                  {record.candidate.status === "ACCEPTED" && record.review?.collectionPlanId ? (
                    <button
                      type="button"
                      disabled={authorizingId === record.candidate.candidateId}
                      onClick={() => void authorizeCollection(record.candidate.candidateId)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-medium text-white disabled:bg-slate-300"
                    >
                      {authorizingId === record.candidate.candidateId ? (
                        <Loader2 className="animate-spin" size={13} />
                      ) : (
                        <Play size={13} />
                      )}
                      Authorize & Run
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
