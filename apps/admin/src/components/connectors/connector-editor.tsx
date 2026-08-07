"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Save, ShieldCheck } from "lucide-react";
import {
  ARTIFACT_KINDS,
  CONNECTOR_CAPABILITIES,
  CONNECTOR_RUNTIMES,
  CONNECTOR_STATUSES,
  HEALTH_CHECK_MODES,
  JOB_TYPES,
  SOURCE_TYPES,
  type ConnectorManifest,
  type ConnectorStatus,
} from "@markorbit/contracts";
import type {
  ConnectorRegistryRecord,
  CreateConnectorManifestInput,
} from "@markorbit/persistence/connectors";

type EditorValues = {
  connectorId: string;
  displayName: string;
  version: string;
  sourceTypes: string;
  runtime: ConnectorManifest["runtime"];
  capabilities: string;
  supportedJobTypes: string;
  configurationSchema: string;
  secretSchema: string;
  outputArtifactKinds: string;
  healthCheckMode: ConnectorManifest["healthCheck"]["mode"];
  healthCheckTimeout: string;
  status: ConnectorStatus;
  extensions: string;
};

const emptyValues: EditorValues = {
  connectorId: "",
  displayName: "",
  version: "1.0.0",
  sourceTypes: "WEB",
  runtime: "PYTHON",
  capabilities: "TEST_CONNECTION, PREVIEW, COLLECT",
  supportedJobTypes: "WEB_CRAWL",
  configurationSchema: JSON.stringify({ type: "object", properties: {} }, null, 2),
  secretSchema: JSON.stringify({ type: "object", properties: {} }, null, 2),
  outputArtifactKinds: "HTML, MARKDOWN",
  healthCheckMode: "NONE",
  healthCheckTimeout: "30",
  status: "ACTIVE",
  extensions: "{}",
};

function csv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function assertAllowed(values: string[], allowed: readonly string[], label: string): string[] {
  const invalid = values.filter((value) => !allowed.includes(value));
  if (invalid.length > 0) throw new Error(`${label} 包含无效值：${invalid.join(", ")}`);
  return values;
}

function fromRecord(record: ConnectorRegistryRecord): EditorValues {
  const manifest = record.manifest;
  return {
    connectorId: manifest.connectorId,
    displayName: manifest.displayName,
    version: manifest.version,
    sourceTypes: manifest.sourceTypes.join(", "),
    runtime: manifest.runtime,
    capabilities: manifest.capabilities.join(", "),
    supportedJobTypes: manifest.supportedJobTypes.join(", "),
    configurationSchema: JSON.stringify(manifest.configurationSchema, null, 2),
    secretSchema: JSON.stringify(manifest.secretSchema, null, 2),
    outputArtifactKinds: manifest.outputArtifactKinds.join(", "),
    healthCheckMode: manifest.healthCheck.mode,
    healthCheckTimeout: String(manifest.healthCheck.timeoutSeconds),
    status: manifest.status,
    extensions: JSON.stringify(manifest.extensions ?? {}, null, 2),
  };
}

function parseObject(value: string, label: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error();
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`${label} 必须是有效 JSON 对象。`);
  }
}

export function ConnectorEditor({
  connectorId,
  version,
}: {
  connectorId?: string;
  version?: string;
}) {
  const router = useRouter();
  const detailMode = Boolean(connectorId && version);
  const [values, setValues] = useState<EditorValues>(emptyValues);
  const [record, setRecord] = useState<ConnectorRegistryRecord | null>(null);
  const [versions, setVersions] = useState<ConnectorRegistryRecord[]>([]);
  const [loading, setLoading] = useState(detailMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!connectorId || !version) return;
    const controller = new AbortController();
    Promise.all([
      fetch(`/api/connectors/${encodeURIComponent(connectorId)}/${encodeURIComponent(version)}`, {
        signal: controller.signal,
      }),
      fetch(`/api/connectors/${encodeURIComponent(connectorId)}/versions`, {
        signal: controller.signal,
      }),
    ])
      .then(async ([detailResponse, versionsResponse]) => {
        const detailBody = (await detailResponse.json()) as {
          connector?: ConnectorRegistryRecord;
          error?: { message?: string };
        };
        const versionsBody = (await versionsResponse.json()) as {
          items?: ConnectorRegistryRecord[];
          error?: { message?: string };
        };
        if (!detailResponse.ok || !detailBody.connector) {
          throw new Error(detailBody.error?.message ?? "Unable to load connector");
        }
        if (!versionsResponse.ok) {
          throw new Error(versionsBody.error?.message ?? "Unable to load connector versions");
        }
        setRecord(detailBody.connector);
        setValues(fromRecord(detailBody.connector));
        setVersions(versionsBody.items ?? []);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load connector");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [connectorId, version]);

  function set<K extends keyof EditorValues>(key: K, value: EditorValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function createConnector(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (detailMode) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const sourceTypes = assertAllowed(csv(values.sourceTypes), SOURCE_TYPES, "Source Types");
      const capabilities = assertAllowed(
        csv(values.capabilities),
        CONNECTOR_CAPABILITIES,
        "Capabilities",
      );
      const jobTypes = assertAllowed(csv(values.supportedJobTypes), JOB_TYPES, "Job Types");
      const artifactKinds = assertAllowed(
        csv(values.outputArtifactKinds),
        ARTIFACT_KINDS,
        "Artifact Kinds",
      );
      const timeoutSeconds = Number(values.healthCheckTimeout);
      if (!Number.isInteger(timeoutSeconds) || timeoutSeconds <= 0) {
        throw new Error("Health Check Timeout 必须是正整数。");
      }

      const extensions = parseObject(values.extensions, "Extensions");
      const payload: CreateConnectorManifestInput = {
        connectorId: values.connectorId,
        displayName: values.displayName,
        version: values.version,
        sourceTypes: sourceTypes as CreateConnectorManifestInput["sourceTypes"],
        runtime: values.runtime,
        capabilities: capabilities as CreateConnectorManifestInput["capabilities"],
        supportedJobTypes: jobTypes as CreateConnectorManifestInput["supportedJobTypes"],
        configurationSchema: parseObject(
          values.configurationSchema,
          "Configuration Schema",
        ) as CreateConnectorManifestInput["configurationSchema"],
        secretSchema: parseObject(
          values.secretSchema,
          "Secret Schema",
        ) as CreateConnectorManifestInput["secretSchema"],
        outputArtifactKinds: artifactKinds as CreateConnectorManifestInput["outputArtifactKinds"],
        healthCheck: {
          mode: values.healthCheckMode,
          timeoutSeconds,
        },
        status: values.status,
        ...(Object.keys(extensions).length > 0
          ? { extensions: extensions as CreateConnectorManifestInput["extensions"] }
          : {}),
      };

      const response = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as {
        connector?: ConnectorRegistryRecord;
        error?: { message?: string };
      };
      if (!response.ok || !body.connector) {
        throw new Error(body.error?.message ?? "Unable to register connector");
      }
      router.push(
        `/connectors/${encodeURIComponent(body.connector.manifest.connectorId)}/${encodeURIComponent(body.connector.manifest.version)}`,
      );
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to register connector");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(status: ConnectorStatus) {
    if (!record) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(
        `/api/connectors/${encodeURIComponent(record.manifest.connectorId)}/${encodeURIComponent(record.manifest.version)}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const body = (await response.json()) as {
        connector?: ConnectorRegistryRecord;
        error?: { message?: string };
      };
      if (!response.ok || !body.connector) {
        throw new Error(body.error?.message ?? "Unable to update connector status");
      }
      setRecord(body.connector);
      setValues(fromRecord(body.connector));
      setSuccess(`Registry 状态已更新为 ${status}。`);
      router.refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update status");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        正在读取 Connector Manifest…
      </div>
    );
  }

  const readOnly = detailMode;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/connectors"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft size={17} aria-hidden="true" /> 返回 Connectors
        </Link>
        {record ? (
          <p className="text-xs text-slate-500">
            已绑定数据源：{record.boundSourceCount} · Runtime health: not evaluated
          </p>
        ) : null}
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

      <form
        onSubmit={createConnector}
        className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"
      >
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
          <div className="flex items-center gap-2 font-medium">
            <ShieldCheck size={17} aria-hidden="true" /> 不可变版本规则
          </div>
          <p className="mt-1">
            Manifest 注册后，Runtime、Capability、Schema
            与输出契约不可修改。发生实质变化时必须注册新的 SemVer 版本；这里只允许调整生命周期状态。
          </p>
        </div>

        <fieldset
          disabled={readOnly || saving}
          className="grid gap-5 md:grid-cols-2 disabled:opacity-75"
        >
          <TextField
            label="Connector ID"
            required
            value={values.connectorId}
            onChange={(value) => set("connectorId", value.toLowerCase())}
          />
          <TextField
            label="显示名称"
            required
            value={values.displayName}
            onChange={(value) => set("displayName", value)}
          />
          <TextField
            label="版本"
            hint="SemVer，例如 1.0.0"
            required
            value={values.version}
            onChange={(value) => set("version", value)}
          />
          <SelectField
            label="Runtime"
            value={values.runtime}
            values={CONNECTOR_RUNTIMES}
            onChange={(value) => set("runtime", value as EditorValues["runtime"])}
          />
          <TextField
            label="Source Types"
            hint="逗号分隔"
            required
            value={values.sourceTypes}
            onChange={(value) => set("sourceTypes", value.toUpperCase())}
          />
          <TextField
            label="Capabilities"
            hint="逗号分隔"
            value={values.capabilities}
            onChange={(value) => set("capabilities", value.toUpperCase())}
          />
          <TextField
            label="Supported Job Types"
            hint="逗号分隔"
            value={values.supportedJobTypes}
            onChange={(value) => set("supportedJobTypes", value.toUpperCase())}
          />
          <TextField
            label="Output Artifact Kinds"
            hint="逗号分隔"
            required
            value={values.outputArtifactKinds}
            onChange={(value) => set("outputArtifactKinds", value.toUpperCase())}
          />
          <SelectField
            label="Health Check Mode"
            value={values.healthCheckMode}
            values={HEALTH_CHECK_MODES}
            onChange={(value) => set("healthCheckMode", value as EditorValues["healthCheckMode"])}
          />
          <TextField
            label="Health Check Timeout"
            hint="秒，仅声明配置"
            type="number"
            required
            value={values.healthCheckTimeout}
            onChange={(value) => set("healthCheckTimeout", value)}
          />
          <SelectField
            label="初始状态"
            value={values.status}
            values={CONNECTOR_STATUSES}
            onChange={(value) => set("status", value as ConnectorStatus)}
          />
          <div />
          <JsonField
            label="Configuration Schema"
            value={values.configurationSchema}
            onChange={(value) => set("configurationSchema", value)}
          />
          <JsonField
            label="Secret Schema"
            hint="仅描述 secretRef 所需字段，不保存秘密值"
            value={values.secretSchema}
            onChange={(value) => set("secretSchema", value)}
          />
          <JsonField
            label="Extensions"
            hint="仅允许 x- 前缀字段"
            value={values.extensions}
            onChange={(value) => set("extensions", value)}
            wide
          />
        </fieldset>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
          {record ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-500">Registry 状态：</span>
              {CONNECTOR_STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={saving || record.manifest.status === status}
                  onClick={() => updateStatus(status)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {status}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-xs text-slate-500">Manifest 不是插件包，不包含可执行代码。</span>
          )}
          {!record ? (
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              <Save size={17} aria-hidden="true" /> {saving ? "注册中…" : "注册 Manifest 版本"}
            </button>
          ) : null}
        </div>
      </form>

      {record ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
            <h2 className="font-semibold text-slate-950">版本历史</h2>
            <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {versions.map((item) => (
                <Link
                  key={item.manifest.version}
                  href={`/connectors/${encodeURIComponent(item.manifest.connectorId)}/${encodeURIComponent(item.manifest.version)}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 text-sm hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">v{item.manifest.version}</span>
                  <span className="text-slate-500">
                    {item.manifest.status} · {item.boundSourceCount} sources
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
            <h2 className="font-semibold text-slate-950">Runtime 操作</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Registry 只证明 Manifest 已登记，不证明 Worker
              已安装、在线或健康。测试、探测、安装和执行将在后续 Worker Runtime 任务中实现。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {["Test connection", "Probe worker", "Install", "Execute"].map((action) => (
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
        </>
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
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function JsonField({
  label,
  hint,
  value,
  onChange,
  wide,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "md:col-span-2" : undefined}>
      <span className="text-sm font-medium text-slate-800">{label}</span>
      {hint ? <span className="ml-2 text-xs text-slate-500">{hint}</span> : null}
      <textarea
        className="mt-2 min-h-40 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
