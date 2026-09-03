"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Copy, KeyRound, Save, ShieldAlert, X } from "lucide-react";
import {
  CONNECTOR_CAPABILITIES,
  JOB_TYPES,
  WORKER_DESIRED_STATES,
  type WorkerConnectorBinding,
  type WorkerDefinition,
  type WorkerRuntimeView,
} from "@markorbit/contracts";
import type {
  CredentialRotationResult,
  WorkerCreationResult,
} from "@markorbit/persistence/workers";
import {
  adminBrowserWorkspaceHeaders,
  adminBrowserWorkspaceMutationHeaders,
} from "@/lib/admin-browser-api-client";

type EditorValues = {
  displayName: string;
  desiredState: WorkerDefinition["desiredState"];
  runtimeId: string;
  runtimeVersion: string;
  supportedJobTypes: string;
  connectorBindings: string;
  maxConcurrency: string;
  labels: string;
};

const defaultBinding: WorkerConnectorBinding = {
  connectorId: "crawl4ai-web",
  version: "1.0.0",
  capabilities: ["COLLECT", "CHECK_UPDATE", "RENDER_JAVASCRIPT", "FETCH_ATTACHMENTS"],
};

const emptyValues: EditorValues = {
  displayName: "",
  desiredState: "ACTIVE",
  runtimeId: "mo-worker",
  runtimeVersion: "1.0.0",
  supportedJobTypes: "WEB_CRAWL, PAGE_UPDATE_CHECK",
  connectorBindings: JSON.stringify([defaultBinding], null, 2),
  maxConcurrency: "1",
  labels: "local",
};

function fromWorker(worker: WorkerDefinition): EditorValues {
  return {
    displayName: worker.displayName,
    desiredState: worker.desiredState,
    runtimeId: worker.runtime.runtimeId,
    runtimeVersion: worker.runtime.version,
    supportedJobTypes: worker.supportedJobTypes.join(", "),
    connectorBindings: JSON.stringify(worker.connectorBindings, null, 2),
    maxConcurrency: String(worker.maxConcurrency),
    labels: worker.labels.join(", "),
  };
}

function commaValues(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function optionLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function WorkerEditor({
  workerId,
  workspaceId,
}: {
  workerId?: string;
  workspaceId: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<EditorValues>(emptyValues);
  const [view, setView] = useState<WorkerRuntimeView | null>(null);
  const [loading, setLoading] = useState(Boolean(workerId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [oneTimeCredential, setOneTimeCredential] = useState<string | null>(null);
  const [createdWorkerId, setCreatedWorkerId] = useState<string | null>(null);
  const activeWorkerId = workerId ?? createdWorkerId;

  useEffect(() => {
    if (!workerId) return;
    const controller = new AbortController();
    fetch(`/api/workers/${workerId}`, {
      headers: adminBrowserWorkspaceHeaders(workspaceId),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          view?: WorkerRuntimeView;
          error?: { message?: string };
        };
        if (!response.ok || !body.view) {
          throw new Error(body.error?.message ?? "Unable to load Worker");
        }
        setView(body.view);
        setValues(fromWorker(body.view.worker));
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load Worker");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [workerId, workspaceId]);

  function set<K extends keyof EditorValues>(key: K, value: EditorValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function payload() {
    let connectorBindings: WorkerConnectorBinding[];
    try {
      connectorBindings = JSON.parse(values.connectorBindings) as WorkerConnectorBinding[];
    } catch {
      throw new Error("Connector 绑定必须是有效 JSON 数组。");
    }
    if (!Array.isArray(connectorBindings)) {
      throw new Error("Connector 绑定必须是 JSON 数组。");
    }
    const maxConcurrency = Number(values.maxConcurrency);
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
      throw new Error("最大并发必须是大于 0 的整数。");
    }
    const supportedJobTypes = commaValues(values.supportedJobTypes);
    const unknownJobTypes = supportedJobTypes.filter(
      (jobType) => !JOB_TYPES.includes(jobType as (typeof JOB_TYPES)[number]),
    );
    if (unknownJobTypes.length > 0) {
      throw new Error(`未知 JobType：${unknownJobTypes.join(", ")}`);
    }
    for (const binding of connectorBindings) {
      const unknownCapabilities = binding.capabilities.filter(
        (capability) =>
          !CONNECTOR_CAPABILITIES.includes(capability as (typeof CONNECTOR_CAPABILITIES)[number]),
      );
      if (unknownCapabilities.length > 0) {
        throw new Error(`未知 Capability：${unknownCapabilities.join(", ")}`);
      }
    }
    return {
      displayName: values.displayName,
      desiredState: values.desiredState,
      runtime: {
        runtimeId: values.runtimeId,
        version: values.runtimeVersion,
      },
      supportedJobTypes,
      connectorBindings,
      maxConcurrency,
      labels: commaValues(values.labels),
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const workerPayload = payload();
      const response = await fetch(
        activeWorkerId ? `/api/workers/${activeWorkerId}` : "/api/workers",
        {
          method: activeWorkerId ? "PATCH" : "POST",
          headers: await adminBrowserWorkspaceMutationHeaders(workspaceId, {
            "Content-Type": "application/json",
          }),
          body: JSON.stringify(
            activeWorkerId
              ? { ...workerPayload, expectedUpdatedAt: view?.worker.updatedAt }
              : workerPayload,
          ),
        },
      );
      const body = (await response.json()) as
        WorkerCreationResult | { view?: WorkerRuntimeView; error?: { message?: string } };
      if (!response.ok || !("view" in body) || !body.view) {
        const message = "error" in body ? body.error?.message : undefined;
        throw new Error(message ?? "Unable to save Worker");
      }
      setView(body.view);
      setValues(fromWorker(body.view.worker));
      if (!activeWorkerId && "credential" in body) {
        setCreatedWorkerId(body.view.worker.id);
        setOneTimeCredential(body.credential);
      } else {
        setSuccess("Worker 已保存。");
      }
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save Worker");
    } finally {
      setSaving(false);
    }
  }

  async function rotateCredential() {
    if (!view || !window.confirm("轮换后旧凭证会立即失效。确认继续？")) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/workers/${view.worker.id}/rotate-credential`, {
        method: "POST",
        headers: await adminBrowserWorkspaceMutationHeaders(workspaceId),
      });
      const body = (await response.json()) as
        CredentialRotationResult | { error?: { message?: string } };
      if (!response.ok || !("credential" in body)) {
        const message = "error" in body ? body.error?.message : undefined;
        throw new Error(message ?? "Unable to rotate Worker credential");
      }
      setOneTimeCredential(body.credential);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to rotate credential",
      );
    } finally {
      setSaving(false);
    }
  }

  async function copyCredential() {
    if (!oneTimeCredential) return;
    await navigator.clipboard.writeText(oneTimeCredential);
    setSuccess("凭证已复制。关闭提示后将无法再次查看。");
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        正在读取 Worker…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/workers"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft size={17} aria-hidden="true" /> 返回 Workers
        </Link>
        {view ? <p className="font-mono text-xs text-slate-500">{view.worker.id}</p> : null}
      </div>

      {oneTimeCredential ? (
        <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 font-semibold text-amber-950">
                <ShieldAlert size={19} aria-hidden="true" /> 一次性 Worker 凭证
              </div>
              <p className="mt-2 text-sm leading-6 text-amber-900">
                该凭证只在本次响应中显示。系统仅保存摘要。请立即复制到受控 Worker
                环境，关闭后无法恢复。
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOneTimeCredential(null);
                if (createdWorkerId) router.replace(`/workers/${createdWorkerId}`);
              }}
              className="rounded-lg p-2 text-amber-800 hover:bg-amber-100"
              aria-label="关闭凭证提示"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-amber-300 bg-white px-3 py-3 text-sm text-slate-900">
              {oneTimeCredential}
            </code>
            <button
              type="button"
              onClick={copyCredential}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-900 px-4 py-3 text-sm font-medium text-white"
            >
              <Copy size={17} aria-hidden="true" /> 复制
            </button>
          </div>
        </section>
      ) : null}

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

      {view ? <WorkerRuntimeSummary view={view} /> : null}

      <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <div className="grid gap-5 md:grid-cols-2">
          <TextField
            label="显示名称"
            required
            value={values.displayName}
            onChange={(value) => set("displayName", value)}
          />
          <SelectField
            label="期望状态"
            value={values.desiredState}
            values={WORKER_DESIRED_STATES}
            onChange={(value) => set("desiredState", value as WorkerDefinition["desiredState"])}
          />
          <TextField
            label="Runtime ID"
            required
            value={values.runtimeId}
            onChange={(value) => set("runtimeId", value.toLowerCase())}
          />
          <TextField
            label="Runtime Version"
            required
            value={values.runtimeVersion}
            onChange={(value) => set("runtimeVersion", value)}
          />
          <TextField
            label="支持的 JobTypes"
            hint="逗号分隔"
            required
            value={values.supportedJobTypes}
            onChange={(value) => set("supportedJobTypes", value)}
          />
          <TextField
            label="最大并发"
            type="number"
            required
            value={values.maxConcurrency}
            onChange={(value) => set("maxConcurrency", value)}
          />
          <TextField
            label="标签"
            hint="逗号分隔"
            value={values.labels}
            onChange={(value) => set("labels", value)}
          />
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
            Worker 必须先通过认证心跳成为 ONLINE，才能领取兼容的 PENDING Job。DRAINING
            不再领取新任务，DISABLED 会撤销活动租约。
          </div>
          <label className="md:col-span-2">
            <span className="text-sm font-medium text-slate-800">精确 Connector 绑定</span>
            <span className="ml-2 text-xs text-slate-500">
              JSON 数组；版本和 Capability 必须与已登记 Manifest 一致
            </span>
            <textarea
              className="mt-2 min-h-64 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-sm"
              value={values.connectorBindings}
              onChange={(event) => set("connectorBindings", event.target.value)}
            />
          </label>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
          <div>
            {view ? (
              <button
                type="button"
                onClick={rotateCredential}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-300 px-4 py-2.5 text-sm font-medium text-amber-900 disabled:opacity-50"
              >
                <KeyRound size={17} aria-hidden="true" /> 轮换凭证
              </button>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            <Save size={17} aria-hidden="true" /> {saving ? "保存中…" : "保存 Worker"}
          </button>
        </div>
      </form>

      {view ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
          <h2 className="font-semibold text-slate-950">活动租约</h2>
          <p className="mt-2 text-sm text-slate-600">
            租约仅代表任务保留，不代表执行开始，也不会在本阶段产生 RawArtifact。
          </p>
          <div className="mt-4 space-y-3">
            {view.activeLeases.length === 0 ? (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                当前没有活动租约。
              </p>
            ) : (
              view.activeLeases.map((lease) => (
                <div key={lease.id} className="rounded-xl border border-slate-200 p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <code>{lease.id}</code>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                      {lease.status}
                    </span>
                  </div>
                  <p className="mt-2 text-slate-600">
                    {lease.jobType} · {lease.connector.connectorId}@{lease.connector.version}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    到期：{new Date(lease.expiresAt).toLocaleString("zh-CN")}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function WorkerRuntimeSummary({ view }: { view: WorkerRuntimeView }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Summary title="有效状态" value={view.effectiveStatus} />
      <Summary title="期望状态" value={view.worker.desiredState} />
      <Summary
        title="并发使用"
        value={`${view.activeLeaseCount} / ${view.worker.maxConcurrency}`}
      />
      <Summary
        title="最近心跳"
        value={
          view.latestHeartbeat
            ? new Date(view.latestHeartbeat.receivedAt).toLocaleString("zh-CN")
            : "尚无心跳"
        }
      />
    </section>
  );
}

function Summary({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{title}</p>
      <p className="mt-2 font-semibold text-slate-950">{value}</p>
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
            {optionLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
