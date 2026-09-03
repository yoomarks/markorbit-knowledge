"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Globe2,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { SOURCE_CATEGORIES, type SourceCategory } from "@markorbit/contracts";
import { PageHeading } from "@/components/page-heading";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";
import { useAdminI18n } from "@/lib/i18n";
import { intakeT, type IntakeMessageKey, type IntakeMessageParams } from "@/lib/intake-i18n";

type CandidateStatus = "DISCOVERED" | "REVIEWED" | "ACCEPTED" | "REJECTED";
type DiscoveryStatus = "RUNNING" | "COMPLETED" | "FAILED";

type DiscoveryOverview = {
  batches: Array<{
    batch: {
      batchId: string;
      createdAt: string;
      seeds: Array<{ seedId: string; locator: string }>;
    };
    status: DiscoveryStatus;
    candidateCount: number;
    completedAt?: string;
    errorMessage?: string;
  }>;
  candidates: {
    total: number;
    summary: Record<CandidateStatus, number> & { total: number };
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

function normalizedLocators(value: string): string[] {
  const values = value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(values)].slice(0, 100);
}

function categoryLabel(value: SourceCategory, zh: boolean): string {
  if (!zh) {
    return value
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  const labels: Partial<Record<SourceCategory, string>> = {
    OFFICIAL_AUTHORITY: "官方机构",
    OFFICIAL_GUIDANCE: "官方指南",
    LAW_FIRM: "律所 / 代理机构",
    NEWS: "新闻",
    RESEARCH: "研究资料",
    TECHNICAL: "技术资料",
    INTERNAL: "内部资料",
    USER_PROVIDED: "用户提供",
    OTHER: "其他",
  };
  return labels[value] ?? value;
}

export function DiscoveryIntakeUi() {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const t = useCallback(
    (key: IntakeMessageKey, params?: IntakeMessageParams) => intakeT(locale, key, params),
    [locale],
  );
  const [overview, setOverview] = useState<DiscoveryOverview | null>(null);
  const [locators, setLocators] = useState("https://www.uspto.gov/");
  const [maxDepth, setMaxDepth] = useState(1);
  const [maxCandidates, setMaxCandidates] = useState(100);
  const [category, setCategory] = useState<SourceCategory>("OTHER");
  const [jurisdictions, setJurisdictions] = useState("GLOBAL");
  const [language, setLanguage] = useState("und");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
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
      setError(refreshError instanceof Error ? refreshError.message : t("discoveryReadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const inputs = useMemo(() => normalizedLocators(locators), [locators]);
  const pending =
    (overview?.candidates.summary.DISCOVERED ?? 0) + (overview?.candidates.summary.REVIEWED ?? 0);

  async function start() {
    if (inputs.length === 0) return;
    setRunning(true);
    setError(null);
    setMessage(null);
    setProgress({ completed: 0, total: inputs.length });
    try {
      const response = await fetch("/api/discovery/batch", {
        method: "POST",
        headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          locators: inputs,
          maxDepth,
          maxCandidates,
          deniedUrlPatterns: ["/login", "/signin", "/logout"],
          intake: {
            category,
            jurisdictions: jurisdictions
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
            languages: language
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
            note,
          },
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as {
        summary: {
          submitted: number;
          uniqueOrigins: number;
          started: number;
          skippedDuplicateInput: number;
          skippedExistingSource: number;
          failed: number;
          candidateCount: number;
        };
      };
      setProgress({ completed: inputs.length, total: inputs.length });
      setMessage(
        t("discoveryBatchSuccessSummary", {
          submitted: result.summary.submitted,
          started: result.summary.started,
          duplicates: result.summary.skippedDuplicateInput,
          existing: result.summary.skippedExistingSource,
          failed: result.summary.failed,
          candidates: result.summary.candidateCount,
        }),
      );
      await refresh();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : t("discoveryRunError"));
    } finally {
      setRunning(false);
    }
  }

  function statusLabel(status: DiscoveryStatus): string {
    if (status === "COMPLETED") return t("completed");
    if (status === "FAILED") return t("failed");
    return t("running");
  }

  return (
    <>
      <PageHeading
        title={t("discoveryTitle")}
        description={t("discoveryDescription")}
        actions={
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || running}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            {t("refresh")}
          </button>
        }
      />

      <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-950">
        <div className="flex items-start gap-3">
          <ShieldCheck size={18} className="mt-0.5 shrink-0" />
          <p>{t("discoveryGuardrail")}</p>
        </div>
      </div>

      {message ? (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/20">
              <Globe2 size={20} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-950">{t("addSitesTitle")}</h2>
              <p className="mt-1 text-sm text-slate-500">{t("addSitesDescription")}</p>
            </div>
          </div>

          <label className="mt-5 block">
            <span className="text-xs font-semibold text-slate-600">{t("websiteAddresses")}</span>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-3 text-slate-400" size={17} />
              <textarea
                value={locators}
                onChange={(event) => setLocators(event.target.value)}
                rows={6}
                placeholder={"https://www.uspto.gov/\nhttps://www.wipo.int/"}
                className="w-full resize-y rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm leading-6 text-slate-900 outline-none focus:border-blue-500"
              />
            </div>
          </label>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div>
              <p className="text-xs font-semibold text-slate-700">{t("intakeDefaultsTitle")}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {t("intakeDefaultsDescription")}
              </p>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="text-xs font-medium text-slate-600">
                {t("intakeCategory")}
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as SourceCategory)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                >
                  {SOURCE_CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {categoryLabel(value, zh)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">
                {t("jurisdictions")}
                <input
                  value={jurisdictions}
                  onChange={(event) => setJurisdictions(event.target.value.toUpperCase())}
                  placeholder={t("intakeJurisdictionPlaceholder")}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                {t("language")}
                <input
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  placeholder={t("intakeLanguagePlaceholder")}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                />
              </label>
            </div>
            <label className="mt-3 block text-xs font-medium text-slate-600">
              {t("intakeNote")}
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={1000}
                placeholder={t("intakeNotePlaceholder")}
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
              />
            </label>
            <p className="mt-3 text-[11px] leading-5 text-slate-500">{t("originDedupHint")}</p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-600">
              {t("discoveryDepth")}
              <select
                value={maxDepth}
                onChange={(event) => setMaxDepth(Number(event.target.value))}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
              >
                <option value={0}>{t("depthHome")}</option>
                <option value={1}>{t("depthStandard")}</option>
                <option value={2}>{t("depthDeep")}</option>
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">
              {t("candidateBudget")}
              <select
                value={maxCandidates}
                onChange={(event) => setMaxCandidates(Number(event.target.value))}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
              >
                <option value={50}>50</option>
                <option value={100}>100 · {t("recommended")}</option>
                <option value={250}>250</option>
                <option value={500}>500</option>
              </select>
            </label>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              {t("recognizedUrls", { count: inputs.length })}
              {running ? ` · ${t("processing", progress)}` : ""}
            </p>
            <button
              type="button"
              onClick={() => void start()}
              disabled={running || inputs.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/15 transition hover:bg-blue-700 disabled:bg-slate-300 disabled:shadow-none"
            >
              {running ? <Loader2 size={16} className="animate-spin" /> : <Globe2 size={16} />}
              {running
                ? t("discovering")
                : inputs.length > 1
                  ? t("batchDiscover")
                  : t("startDiscover")}
            </button>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("discoveryStatus")}
              </p>
              <h2 className="mt-1 font-semibold text-slate-950">{t("discoveryProgress")}</h2>
            </div>
            <CheckCircle2 size={20} className="text-emerald-600" />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {[
              [overview?.batches.length ?? 0, t("recentBatches")],
              [overview?.candidates.total ?? 0, t("allCandidates")],
              [pending, t("pendingSourcesReview")],
              [overview?.candidates.summary.ACCEPTED ?? 0, t("approved")],
            ].map(([value, label]) => (
              <div key={String(label)} className="rounded-xl bg-slate-50 p-4">
                <p className="text-xl font-semibold text-slate-950">{value}</p>
                <p className="mt-1 text-xs text-slate-500">{label}</p>
              </div>
            ))}
          </div>

          <Link
            href="/sources"
            className="mt-5 inline-flex w-full items-center justify-between rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
          >
            <span>
              {pending > 0 ? t("reviewCandidates", { count: pending }) : t("reviewGeneric")}
            </span>
            <ArrowRight size={17} />
          </Link>
        </article>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
          <h2 className="font-semibold text-slate-950">{t("recentDiscoveryRuns")}</h2>
          <p className="mt-1 text-sm text-slate-500">{t("recentDiscoveryHint")}</p>
        </div>
        {overview?.batches.length ? (
          <div className="divide-y divide-slate-100">
            {overview.batches.slice(0, 8).map((record) => (
              <div
                key={record.batch.batchId}
                className="grid gap-2 px-5 py-4 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center sm:px-6"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">
                    {record.batch.seeds[0]?.locator ?? record.batch.batchId}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(record.batch.createdAt).toLocaleString(locale)} ·{" "}
                    {record.batch.batchId}
                  </p>
                </div>
                <span className="text-xs text-slate-500">
                  {t("candidateCount", { count: record.candidateCount })}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    record.status === "COMPLETED"
                      ? "bg-emerald-50 text-emerald-700"
                      : record.status === "FAILED"
                        ? "bg-rose-50 text-rose-700"
                        : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {statusLabel(record.status)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-10 text-center text-sm text-slate-500">{t("noDiscoveryRuns")}</div>
        )}
      </section>
    </>
  );
}
