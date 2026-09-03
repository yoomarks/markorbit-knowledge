"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Archive, ArrowLeft, Pause, Play, Save } from "lucide-react";
import {
  ARTIFACT_KINDS,
  COLLECTION_PRIORITIES,
  SCHEDULE_MODES,
  type ArtifactKind,
  type CollectionPlan,
  type CollectionPlanStatus,
  type SourceDefinition,
} from "@markorbit/contracts";
import type { SourceListResult } from "@markorbit/persistence";
import type { CollectionPlanRegistryRecord } from "@markorbit/persistence/collection-plans";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";

type Values = {
  sourceId: string;
  name: string;
  scheduleMode: CollectionPlan["schedule"]["mode"];
  intervalSeconds: string;
  cronExpression: string;
  timezone: string;
  pollIntervalSeconds: string;
  priority: CollectionPlan["priority"];
  includePatterns: string;
  excludePatterns: string;
  maxDepth: string;
  maxItems: string;
  renderJavascript: boolean;
  fetchAttachments: boolean;
  respectRobots: boolean;
  rateLimitPerMinute: string;
  timeoutSeconds: string;
  retryMaxAttempts: string;
  retryBackoffSeconds: string;
  locale: string;
  artifactKinds: ArtifactKind[];
  conversionProfileId: string;
};

const emptyValues: Values = {
  sourceId: "",
  name: "",
  scheduleMode: "MANUAL",
  intervalSeconds: "3600",
  cronExpression: "0 8 * * *",
  timezone: "Asia/Shanghai",
  pollIntervalSeconds: "3600",
  priority: "NORMAL",
  includePatterns: "",
  excludePatterns: "",
  maxDepth: "2",
  maxItems: "100",
  renderJavascript: false,
  fetchAttachments: false,
  respectRobots: true,
  rateLimitPerMinute: "30",
  timeoutSeconds: "60",
  retryMaxAttempts: "3",
  retryBackoffSeconds: "10",
  locale: "",
  artifactKinds: ["HTML", "MARKDOWN"],
  conversionProfileId: "",
};

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function integer(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${label} 必须是整数。`);
  return parsed;
}

function fromPlan(plan: CollectionPlan): Values {
  return {
    sourceId: plan.sourceId,
    name: plan.name,
    scheduleMode: plan.schedule.mode,
    intervalSeconds:
      plan.schedule.mode === "INTERVAL" ? String(plan.schedule.intervalSeconds) : "3600",
    cronExpression: plan.schedule.mode === "CRON" ? plan.schedule.expression : "0 8 * * *",
    timezone: plan.schedule.mode === "CRON" ? plan.schedule.timezone : "Asia/Shanghai",
    pollIntervalSeconds:
      plan.schedule.mode === "CHANGE_WATCH" ? String(plan.schedule.pollIntervalSeconds) : "3600",
    priority: plan.priority,
    includePatterns: plan.policy.includePatterns.join("\n"),
    excludePatterns: plan.policy.excludePatterns.join("\n"),
    maxDepth: String(plan.policy.maxDepth),
    maxItems: String(plan.policy.maxItems),
    renderJavascript: plan.policy.renderJavascript,
    fetchAttachments: plan.policy.fetchAttachments,
    respectRobots: plan.policy.respectRobots,
    rateLimitPerMinute: String(plan.policy.rateLimitPerMinute),
    timeoutSeconds: String(plan.policy.timeoutSeconds),
    retryMaxAttempts: String(plan.policy.retry.maxAttempts),
    retryBackoffSeconds: String(plan.policy.retry.backoffSeconds),
    locale: plan.policy.locale ?? "",
    artifactKinds: plan.output.artifactKinds,
    conversionProfileId: plan.output.conversionProfileId ?? "",
  };
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function PlanEditor({ planId }: { planId?: string }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(emptyValues);
  const [record, setRecord] = useState<CollectionPlanRegistryRecord | null>(null);
  const [sources, setSources] = useState<SourceDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const sourceRequest = fetch("/api/sources?limit=100", { signal: controller.signal }).then(
      async (response) => {
        const body = (await response.json()) as SourceListResult | { error?: { message?: string } };
        if (!response.ok) {
          const message = "error" in body ? body.error?.message : undefined;
          throw new Error(message ?? "Unable to load sources");
        }
        return (body as SourceListResult).items.filter((source) => source.status !== "ARCHIVED");
      },
    );
    const planRequest = planId
      ? fetch(`/api/plans/${planId}`, { signal: controller.signal }).then(async (response) => {
          const body = (await response.json()) as {
            plan?: CollectionPlanRegistryRecord;
            error?: { message?: string };
          };
          if (!response.ok || !body.plan) {
            throw new Error(body.error?.message ?? "Unable to load collection plan");
          }
          return body.plan;
        })
      : Promise.resolve(null);

    Promise.all([sourceRequest, planRequest])
      .then(([sourceItems, planRecord]) => {
        setSources(sourceItems);
        if (planRecord) {
          setRecord(planRecord);
          setValues(fromPlan(planRecord.plan));
        } else if (sourceItems[0]) {
          setValues((current) => ({ ...current, sourceId: sourceItems[0].id }));
        }
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load editor");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [planId]);

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function toggleArtifact(kind: ArtifactKind) {
    setValues((current) => {
      const selected = current.artifactKinds.includes(kind);
      return {
        ...current,
        artifactKinds: selected
          ? current.artifactKinds.filter((item) => item !== kind)
          : [...current.artifactKinds, kind],
      };
    });
  }

  function schedule(): CollectionPlan["schedule"] {
    switch (values.scheduleMode) {
      case "MANUAL":
        return { mode: "MANUAL" };
      case "INTERVAL":
        return { mode: "INTERVAL", intervalSeconds: integer(values.intervalSeconds, "间隔秒数") };
      case "CRON":
        return {
          mode: "CRON",
          expression: values.cronExpression,
          timezone: values.timezone,
        };
      case "CHANGE_WATCH":
        return {
          mode: "CHANGE_WATCH",
          pollIntervalSeconds: integer(values.pollIntervalSeconds, "检查间隔秒数"),
        };
    }
  }

  function payload() {
    if (values.artifactKinds.length === 0) throw new Error("至少选择一种输出文件类型。");
    return {
      sourceId: values.sourceId,
      name: values.name,
      schedule: schedule(),
      priority: values.priority,
      policy: {
        includePatterns: lines(values.includePatterns),
        excludePatterns: lines(values.excludePatterns),
        maxDepth: integer(values.maxDepth, "最大深度"),
        maxItems: integer(values.maxItems, "最大条目数"),
        renderJavascript: values.renderJavascript,
        fetchAttachments: values.fetchAttachments,
        respectRobots: values.respectRobots,
        rateLimitPerMinute: integer(values.rateLimitPerMinute, "每分钟请求数"),
        timeoutSeconds: integer(values.timeoutSeconds, "超时秒数"),
        retry: {
          maxAttempts: integer(values.retryMaxAttempts, "重试次数"),
          backoffSeconds: integer(values.retryBackoffSeconds, "退避秒数"),
        },
        ...(values.locale ? { locale: values.locale } : {}),
      },
      output: {
        artifactKinds: values.artifactKinds,
        ...(values.conversionProfileId ? { conversionProfileId: values.conversionProfileId } : {}),
      },
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const requestPayload = payload();
      const response = await fetch(planId ? `/api/plans/${planId}` : "/api/plans", {
        method: planId ? "PATCH" : "POST",
        headers: await adminBrowserMutationHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(
          planId
            ? { ...requestPayload, expectedUpdatedAt: record?.plan.updatedAt }
            : requestPayload,
        ),
      });
      const body = (await response.json()) as {
        plan?: CollectionPlanRegistryRecord;
        error?: { message?: string };
      };
      if (!response.ok || !body.plan) {
        throw new Error(body.error?.message ?? "Unable to save collection plan");
      }
      if (!planId) {
        router.push(`/jobs/${body.plan.plan.id}`);
        router.refresh();
        return;
      }
      setRecord(body.plan);
      setValues(fromPlan(body.plan.plan));
      setSuccess("采集计划已保存。计划仍只表示调度意图。");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save plan");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: CollectionPlanStatus) {
    if (!record) return;
    const message =
      status === "ARCHIVED"
        ? "确认归档该计划？归档后不能重新启用。"
        : status === "ACTIVE"
          ? "确认启用该计划？当前仅保存启用意图，不会开始执行。"
          : "确认暂停该计划？";
    if (!window.confirm(message)) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/plans/${record.plan.id}/status`, {
        method: "POST",
        headers: await adminBrowserMutationHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status, expectedUpdatedAt: record.plan.updatedAt }),
      });
      const body = (await response.json()) as {
        plan?: CollectionPlanRegistryRecord;
        error?: { message?: string };
      };
      if (!response.ok || !body.plan) {
        throw new Error(body.error?.message ?? "Unable to update plan status");
      }
      setRecord(body.plan);
      setValues(fromPlan(body.plan.plan));
      setSuccess(`计划状态已更新为 ${status}。`);
      router.refresh();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Unable to update status");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        正在读取 CollectionPlan Registry…
      </div>
    );
  }

  const archived = record?.plan.status === "ARCHIVED";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/jobs"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft size={17} aria-hidden="true" /> 返回采集计划
        </Link>
        {record ? <p className="text-xs text-slate-500">ID: {record.plan.id}</p> : null}
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

      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
        CollectionPlan 只保存采集策略和调度意图。启用计划可在下方创建 PENDING CollectionRun 与
        Job；系统仍不会计算下一次执行时间、调用 Worker 或运行 Crawl4AI。
      </div>

      <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <fieldset disabled={archived} className="space-y-7 disabled:opacity-70">
          <section>
            <h2 className="font-semibold text-slate-950">基础信息</h2>
            <div className="mt-4 grid gap-5 md:grid-cols-2">
              <label>
                <span className="text-sm font-medium text-slate-800">数据源</span>
                <select
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                  value={values.sourceId}
                  disabled={Boolean(planId)}
                  onChange={(event) => set("sourceId", event.target.value)}
                >
                  {sources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name} · {source.slug} · {source.status}
                    </option>
                  ))}
                </select>
              </label>
              <TextField
                label="计划名称"
                required
                value={values.name}
                onChange={(value) => set("name", value)}
              />
              <SelectField
                label="优先级"
                value={values.priority}
                values={COLLECTION_PRIORITIES}
                onChange={(value) => set("priority", value as Values["priority"])}
              />
              <SelectField
                label="计划方式"
                value={values.scheduleMode}
                values={SCHEDULE_MODES}
                onChange={(value) => set("scheduleMode", value as Values["scheduleMode"])}
              />
              {values.scheduleMode === "INTERVAL" ? (
                <TextField
                  label="间隔秒数"
                  type="number"
                  required
                  value={values.intervalSeconds}
                  onChange={(value) => set("intervalSeconds", value)}
                />
              ) : null}
              {values.scheduleMode === "CRON" ? (
                <>
                  <TextField
                    label="Cron 表达式"
                    required
                    value={values.cronExpression}
                    onChange={(value) => set("cronExpression", value)}
                  />
                  <TextField
                    label="时区"
                    required
                    value={values.timezone}
                    onChange={(value) => set("timezone", value)}
                  />
                </>
              ) : null}
              {values.scheduleMode === "CHANGE_WATCH" ? (
                <TextField
                  label="检查间隔秒数"
                  type="number"
                  required
                  value={values.pollIntervalSeconds}
                  onChange={(value) => set("pollIntervalSeconds", value)}
                />
              ) : null}
            </div>
          </section>

          <section className="border-t border-slate-100 pt-6">
            <h2 className="font-semibold text-slate-950">采集策略</h2>
            <div className="mt-4 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              <TextField
                label="最大深度"
                type="number"
                required
                value={values.maxDepth}
                onChange={(value) => set("maxDepth", value)}
              />
              <TextField
                label="最大条目数"
                type="number"
                required
                value={values.maxItems}
                onChange={(value) => set("maxItems", value)}
              />
              <TextField
                label="每分钟请求数"
                type="number"
                required
                value={values.rateLimitPerMinute}
                onChange={(value) => set("rateLimitPerMinute", value)}
              />
              <TextField
                label="超时秒数"
                type="number"
                required
                value={values.timeoutSeconds}
                onChange={(value) => set("timeoutSeconds", value)}
              />
              <TextField
                label="最大重试次数"
                type="number"
                required
                value={values.retryMaxAttempts}
                onChange={(value) => set("retryMaxAttempts", value)}
              />
              <TextField
                label="重试退避秒数"
                type="number"
                required
                value={values.retryBackoffSeconds}
                onChange={(value) => set("retryBackoffSeconds", value)}
              />
              <TextField
                label="Locale"
                value={values.locale}
                onChange={(value) => set("locale", value)}
              />
            </div>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <TextArea
                label="包含规则"
                hint="每行一个模式"
                value={values.includePatterns}
                onChange={(value) => set("includePatterns", value)}
              />
              <TextArea
                label="排除规则"
                hint="每行一个模式"
                value={values.excludePatterns}
                onChange={(value) => set("excludePatterns", value)}
              />
            </div>
            <div className="mt-5 flex flex-wrap gap-5">
              <Checkbox
                label="渲染 JavaScript"
                checked={values.renderJavascript}
                onChange={(value) => set("renderJavascript", value)}
              />
              <Checkbox
                label="抓取附件"
                checked={values.fetchAttachments}
                onChange={(value) => set("fetchAttachments", value)}
              />
              <Checkbox
                label="遵守 robots.txt"
                checked={values.respectRobots}
                onChange={(value) => set("respectRobots", value)}
              />
            </div>
          </section>

          <section className="border-t border-slate-100 pt-6">
            <h2 className="font-semibold text-slate-950">输出</h2>
            <p className="mt-1 text-sm text-slate-500">
              所选输出类型必须包含在数据源绑定 ConnectorManifest 的输出范围中。
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {ARTIFACT_KINDS.map((kind) => (
                <label
                  key={kind}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={values.artifactKinds.includes(kind)}
                    onChange={() => toggleArtifact(kind)}
                  />
                  {kind}
                </label>
              ))}
            </div>
            <div className="mt-5 max-w-md">
              <TextField
                label="Conversion Profile ID"
                hint="可选，格式 cnv_…"
                value={values.conversionProfileId}
                onChange={(value) => set("conversionProfileId", value)}
              />
            </div>
          </section>
        </fieldset>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
          <div className="flex flex-wrap gap-2">
            {record && record.plan.status !== "ARCHIVED" ? (
              <>
                {record.plan.status === "ACTIVE" ? (
                  <button
                    type="button"
                    onClick={() => changeStatus("PAUSED")}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl border border-amber-200 px-4 py-2.5 text-sm font-medium text-amber-800"
                  >
                    <Pause size={17} /> 暂停
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => changeStatus("ACTIVE")}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 px-4 py-2.5 text-sm font-medium text-emerald-700"
                  >
                    <Play size={17} /> 启用意图
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => changeStatus("ARCHIVED")}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-medium text-rose-700"
                >
                  <Archive size={17} /> 归档
                </button>
              </>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={saving || archived || sources.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            <Save size={17} /> {saving ? "保存中…" : "保存计划"}
          </button>
        </div>
      </form>

      {record ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
          <h2 className="font-semibold text-slate-950">执行能力</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            这些操作将在 Job Scheduler、Worker Runtime 与 Crawl4AI
            集成完成后启用。当前不模拟执行记录。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {["立即运行", "预览采集", "下一次执行", "执行历史"].map((action) => (
              <button
                key={action}
                type="button"
                disabled
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400"
              >
                {action}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function TextField({
  label,
  hint,
  type = "text",
  required,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  type?: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="text-sm font-medium text-slate-800">{label}</span>
      {hint ? <span className="ml-2 text-xs text-slate-500">{hint}</span> : null}
      <input
        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextArea({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="text-sm font-medium text-slate-800">{label}</span>
      {hint ? <span className="ml-2 text-xs text-slate-500">{hint}</span> : null}
      <textarea
        className="mt-2 min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="text-sm font-medium text-slate-800">{label}</span>
      <select
        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {values.map((option) => (
          <option key={option} value={option}>
            {titleCase(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
