"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Archive, ArrowLeft, Save } from "lucide-react";
import {
  AUTHORITY_LEVELS,
  SOURCE_CATEGORIES,
  SOURCE_STATUSES,
  SOURCE_TYPES,
  type SourceDefinition,
} from "@markorbit/contracts";
import type { ConnectorRegistryRecord } from "@markorbit/persistence/connectors";

type EditorValues = {
  name: string;
  slug: string;
  sourceType: SourceDefinition["sourceType"];
  category: SourceDefinition["category"];
  authorityLevel: SourceDefinition["authorityLevel"];
  status: SourceDefinition["status"];
  jurisdictions: string;
  languages: string;
  canonicalUri: string;
  entrypointUri: string;
  entrypointLabel: string;
  connectorId: string;
  connectorVersion: string;
  connectorConfig: string;
  secretRef: string;
  tags: string;
};

const emptyValues: EditorValues = {
  name: "",
  slug: "",
  sourceType: "WEB",
  category: "OFFICIAL_AUTHORITY",
  authorityLevel: "PRIMARY_OFFICIAL",
  status: "DRAFT",
  jurisdictions: "",
  languages: "zh-CN",
  canonicalUri: "",
  entrypointUri: "",
  entrypointLabel: "",
  connectorId: "",
  connectorVersion: "",
  connectorConfig: "{}",
  secretRef: "",
  tags: "",
};

function fromSource(source: SourceDefinition): EditorValues {
  return {
    name: source.name,
    slug: source.slug,
    sourceType: source.sourceType,
    category: source.category,
    authorityLevel: source.authorityLevel,
    status: source.status,
    jurisdictions: source.jurisdictions.join(", "),
    languages: source.languages.join(", "),
    canonicalUri: source.canonicalUri ?? "",
    entrypointUri: source.entrypoints[0]?.uri ?? "",
    entrypointLabel: source.entrypoints[0]?.label ?? "",
    connectorId: source.connector.connectorId,
    connectorVersion: source.connector.version,
    connectorConfig: JSON.stringify(source.connectorConfig, null, 2),
    secretRef: source.secretRef ?? "",
    tags: source.tags.join(", "),
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

function connectorKey(connectorId: string, version: string): string {
  return `${connectorId}@@${version}`;
}

export function SourceEditor({ sourceId }: { sourceId?: string }) {
  const router = useRouter();
  const [values, setValues] = useState<EditorValues>(emptyValues);
  const [source, setSource] = useState<SourceDefinition | null>(null);
  const [connectors, setConnectors] = useState<ConnectorRegistryRecord[]>([]);
  const [loading, setLoading] = useState(Boolean(sourceId));
  const [connectorLoading, setConnectorLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceId) return;
    const controller = new AbortController();
    fetch(`/api/sources/${sourceId}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as {
          source?: SourceDefinition;
          error?: { message?: string };
        };
        if (!response.ok || !body.source) {
          throw new Error(body.error?.message ?? "Unable to load source");
        }
        setSource(body.source);
        setValues(fromSource(body.source));
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load source");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [sourceId]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/connectors/compatible?sourceType=${encodeURIComponent(values.sourceType)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          items?: ConnectorRegistryRecord[];
          error?: { message?: string };
        };
        if (!response.ok) {
          throw new Error(body.error?.message ?? "Unable to load compatible connectors");
        }
        const active = body.items ?? [];
        const existingBindingMatchesType = source?.sourceType === values.sourceType;
        const existingKey = source
          ? connectorKey(source.connector.connectorId, source.connector.version)
          : null;
        const activeHasExisting = existingKey
          ? active.some(
              (item) =>
                connectorKey(item.manifest.connectorId, item.manifest.version) === existingKey,
            )
          : false;
        const next = [...active];

        if (source && existingBindingMatchesType && !activeHasExisting) {
          next.unshift({
            manifest: {
              schemaVersion: "1.0",
              objectType: "CONNECTOR_MANIFEST",
              connectorId: source.connector.connectorId,
              displayName: `${source.connector.connectorId}（现有绑定）`,
              version: source.connector.version,
              sourceTypes: [source.sourceType],
              runtime: "EXTERNAL",
              capabilities: [],
              supportedJobTypes: [],
              configurationSchema: {},
              secretSchema: {},
              outputArtifactKinds: [],
              healthCheck: { mode: "NONE", timeoutSeconds: 1 },
              status: "DEPRECATED",
            },
            registeredAt: source.createdAt,
            updatedAt: source.updatedAt,
            boundSourceCount: 1,
            runtimeHealth: "NOT_EVALUATED",
          });
        }

        setConnectors(next);
        setValues((current) => {
          const selectedKey = connectorKey(current.connectorId, current.connectorVersion);
          const selectedStillAvailable = next.some(
            (item) =>
              connectorKey(item.manifest.connectorId, item.manifest.version) === selectedKey,
          );
          if (selectedStillAvailable) return current;
          const first = next[0];
          return {
            ...current,
            connectorId: first?.manifest.connectorId ?? "",
            connectorVersion: first?.manifest.version ?? "",
          };
        });
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(
          requestError instanceof Error ? requestError.message : "Unable to load connectors",
        );
        setConnectors([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setConnectorLoading(false);
      });
    return () => controller.abort();
  }, [source, values.sourceType]);

  function set<K extends keyof EditorValues>(key: K, value: EditorValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function selectConnector(value: string) {
    const [connectorId, connectorVersion] = value.split("@@");
    setValues((current) => ({ ...current, connectorId, connectorVersion }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (!values.connectorId || !values.connectorVersion) {
        throw new Error("当前来源类型没有可用的 ACTIVE Connector 版本。");
      }
      let connectorConfig: Record<string, unknown>;
      try {
        connectorConfig = JSON.parse(values.connectorConfig) as Record<string, unknown>;
      } catch {
        throw new Error("Connector Config 必须是有效 JSON。");
      }

      const payload = {
        name: values.name,
        slug: values.slug,
        sourceType: values.sourceType,
        category: values.category,
        authorityLevel: values.authorityLevel,
        status: values.status,
        jurisdictions: commaValues(values.jurisdictions).map((item) => item.toUpperCase()),
        languages: commaValues(values.languages),
        connector: {
          connectorId: values.connectorId,
          version: values.connectorVersion,
        },
        connectorConfig,
        canonicalUri: values.canonicalUri || null,
        entrypoints: [
          {
            uri: values.entrypointUri,
            ...(values.entrypointLabel ? { label: values.entrypointLabel } : {}),
          },
        ],
        secretRef: values.secretRef || null,
        tags: commaValues(values.tags),
      };

      const response = await fetch(sourceId ? `/api/sources/${sourceId}` : "/api/sources", {
        method: sourceId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          sourceId ? { ...payload, expectedUpdatedAt: source?.updatedAt } : payload,
        ),
      });
      const body = (await response.json()) as {
        source?: SourceDefinition;
        error?: { message?: string };
      };
      if (!response.ok || !body.source) {
        throw new Error(body.error?.message ?? "Unable to save source");
      }

      if (!sourceId) {
        router.push(`/sources/${body.source.id}`);
        router.refresh();
        return;
      }

      setSource(body.source);
      setValues(fromSource(body.source));
      setSuccess("数据源已保存。");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save source");
    } finally {
      setSaving(false);
    }
  }

  async function archiveSource() {
    if (!source || !window.confirm("确认归档该数据源？归档不会删除历史记录。")) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/sources/${source.id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedUpdatedAt: source.updatedAt }),
      });
      const body = (await response.json()) as {
        source?: SourceDefinition;
        error?: { message?: string };
      };
      if (!response.ok || !body.source) {
        throw new Error(body.error?.message ?? "Unable to archive source");
      }
      setSource(body.source);
      setValues(fromSource(body.source));
      setSuccess("数据源已归档，历史记录仍然保留。");
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Unable to archive source");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        正在读取数据源…
      </div>
    );
  }

  const selectedConnector = connectorKey(values.connectorId, values.connectorVersion);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/sources"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft size={17} aria-hidden="true" /> 返回数据源列表
        </Link>
        {source ? <p className="text-xs text-slate-500">ID: {source.id}</p> : null}
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

      <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <div className="grid gap-5 md:grid-cols-2">
          <TextField
            label="名称"
            required
            value={values.name}
            onChange={(value) => set("name", value)}
          />
          <TextField
            label="Slug"
            required
            value={values.slug}
            onChange={(value) => set("slug", value.toLowerCase())}
          />
          <SelectField
            label="来源类型"
            value={values.sourceType}
            values={SOURCE_TYPES}
            onChange={(value) => set("sourceType", value as EditorValues["sourceType"])}
          />
          <SelectField
            label="分类"
            value={values.category}
            values={SOURCE_CATEGORIES}
            onChange={(value) => set("category", value as EditorValues["category"])}
          />
          <SelectField
            label="权威等级"
            value={values.authorityLevel}
            values={AUTHORITY_LEVELS}
            onChange={(value) => set("authorityLevel", value as EditorValues["authorityLevel"])}
          />
          <SelectField
            label="状态"
            value={values.status}
            values={SOURCE_STATUSES}
            onChange={(value) => set("status", value as EditorValues["status"])}
          />
          <TextField
            label="国家 / 地区"
            hint="逗号分隔，例如 US, EU"
            value={values.jurisdictions}
            onChange={(value) => set("jurisdictions", value)}
          />
          <TextField
            label="语言"
            hint="逗号分隔，例如 en-US, zh-CN"
            required
            value={values.languages}
            onChange={(value) => set("languages", value)}
          />
          <TextField
            label="Canonical URI"
            type="url"
            value={values.canonicalUri}
            onChange={(value) => set("canonicalUri", value)}
          />
          <TextField
            label="入口 URI"
            type="url"
            required
            value={values.entrypointUri}
            onChange={(value) => set("entrypointUri", value)}
          />
          <TextField
            label="入口名称"
            value={values.entrypointLabel}
            onChange={(value) => set("entrypointLabel", value)}
          />
          <TextField
            label="标签"
            hint="逗号分隔"
            value={values.tags}
            onChange={(value) => set("tags", value)}
          />
          <label className="md:col-span-2">
            <span className="text-sm font-medium text-slate-800">Connector Manifest</span>
            <span className="ml-2 text-xs text-slate-500">
              仅显示与当前 Source Type 兼容的 ACTIVE 版本；现有弃用绑定可保留
            </span>
            <select
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
              value={selectedConnector}
              disabled={connectorLoading || connectors.length === 0}
              onChange={(event) => selectConnector(event.target.value)}
              required
            >
              {connectors.length === 0 ? (
                <option value="">没有兼容的 ACTIVE Connector</option>
              ) : null}
              {connectors.map((record) => (
                <option
                  key={connectorKey(record.manifest.connectorId, record.manifest.version)}
                  value={connectorKey(record.manifest.connectorId, record.manifest.version)}
                >
                  {record.manifest.displayName} · {record.manifest.connectorId}@
                  {record.manifest.version} · {record.manifest.status}
                </option>
              ))}
            </select>
          </label>
          <TextField
            label="Secret Reference"
            hint="只允许 sec_… 引用，不得填写密码或 Token"
            value={values.secretRef}
            onChange={(value) => set("secretRef", value)}
          />
          <div />
          <label className="md:col-span-2">
            <span className="text-sm font-medium text-slate-800">Connector Config</span>
            <span className="ml-2 text-xs text-slate-500">仅允许非敏感 JSON 配置</span>
            <textarea
              className="mt-2 min-h-32 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-sm"
              value={values.connectorConfig}
              onChange={(event) => set("connectorConfig", event.target.value)}
            />
          </label>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
          <div className="flex flex-wrap gap-2">
            {source ? (
              <button
                type="button"
                onClick={archiveSource}
                disabled={saving || source.status === "ARCHIVED"}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-medium text-rose-700 disabled:opacity-40"
              >
                <Archive size={17} aria-hidden="true" /> 归档
              </button>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={saving || connectorLoading || connectors.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            <Save size={17} aria-hidden="true" /> {saving ? "保存中…" : "保存数据源"}
          </button>
        </div>
      </form>

      {source ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
          <h2 className="font-semibold text-slate-950">Connector 执行能力</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            测试连接、发现页面、预览采集、立即采集和检查更新将在 Connector Runtime
            任务中启用。当前页面只维护 Source Registry，不模拟执行结果。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {["测试连接", "发现页面", "预览采集", "立即采集", "检查更新"].map((action) => (
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
