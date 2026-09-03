"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { CONVERTER_STATUSES, type ConverterStatus } from "@markorbit/contracts";
import type { ConverterRegistryRecord } from "@markorbit/persistence/converters";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";

export function ConverterDetail({
  converterId,
  version,
}: {
  converterId: string;
  version: string;
}) {
  const [record, setRecord] = useState<ConverterRegistryRecord | null>(null);
  const [versions, setVersions] = useState<ConverterRegistryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void Promise.all([
        fetch(`/api/converters/${encodeURIComponent(converterId)}/${encodeURIComponent(version)}`, {
          signal: controller.signal,
        }),
        fetch(`/api/converters/${encodeURIComponent(converterId)}/versions`, {
          signal: controller.signal,
        }),
      ])
        .then(async ([detailResponse, versionsResponse]) => {
          const detailBody = (await detailResponse.json()) as {
            record?: ConverterRegistryRecord;
            error?: { message?: string };
          };
          const versionsBody = (await versionsResponse.json()) as {
            items?: ConverterRegistryRecord[];
            error?: { message?: string };
          };
          if (!detailResponse.ok || !detailBody.record) {
            throw new Error(detailBody.error?.message ?? "Unable to load Converter Manifest");
          }
          if (!versionsResponse.ok) {
            throw new Error(versionsBody.error?.message ?? "Unable to load Converter versions");
          }
          setRecord(detailBody.record);
          setVersions(versionsBody.items ?? []);
        })
        .catch((requestError: unknown) => {
          if (requestError instanceof DOMException && requestError.name === "AbortError") return;
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load Converter Manifest",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [converterId, version]);

  async function updateStatus(status: ConverterStatus) {
    if (!record) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const headers = await adminBrowserMutationHeaders({
        "content-type": "application/json",
      });
      const response = await fetch(
        `/api/converters/${encodeURIComponent(converterId)}/${encodeURIComponent(version)}/status`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ status }),
        },
      );
      const body = (await response.json()) as {
        record?: ConverterRegistryRecord;
        error?: { message?: string };
      };
      if (!response.ok || !body.record) {
        throw new Error(body.error?.message ?? "Unable to update Converter status");
      }
      setRecord(body.record);
      setMessage(`Registry 状态已更新为 ${status}。`);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to update Converter status",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        正在读取 Converter Manifest…
      </div>
    );
  }

  if (!record) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        {error ?? "Converter Manifest 不存在。"}
      </div>
    );
  }

  const manifest = record.manifest;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/converters"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft size={17} aria-hidden="true" /> 返回 Converters
        </Link>
        <p className="text-xs text-slate-500">
          已绑定 Profile：{record.boundProfileCount} · Runtime health: not evaluated
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
          <div className="flex items-center gap-2 font-medium">
            <ShieldCheck size={17} aria-hidden="true" /> 不可变版本规则
          </div>
          <p className="mt-1">
            Runtime、Capability、输入覆盖、Schema 与资源限制注册后不可修改。实质变化必须登记新的
            SemVer 版本；此处只允许调整生命周期状态。
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Converter ID" value={manifest.converterId} mono />
          <Field label="Version" value={manifest.version} mono />
          <Field label="Display Name" value={manifest.displayName} />
          <Field label="Runtime" value={manifest.runtime} />
          <Field label="Artifact Kinds" value={manifest.inputs.artifactKinds.join(", ")} />
          <Field label="MIME Patterns" value={manifest.inputs.mimePatterns.join(", ")} mono />
          <Field label="Output" value={manifest.outputFormat} />
          <Field label="Capabilities" value={manifest.capabilities.join(", ")} />
          <Field label="Deterministic" value={manifest.deterministic ? "YES" : "NO"} />
          <Field
            label="Resource Hints"
            value={`${manifest.resourceHints.maxInputBytes} bytes · ${manifest.resourceHints.timeoutSeconds}s`}
          />
        </div>

        <label className="mt-6 block text-sm font-medium text-slate-700">
          Lifecycle Status
          <select
            disabled={saving}
            value={manifest.status}
            onChange={(event) => void updateStatus(event.target.value as ConverterStatus)}
            className="mt-1 block rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:opacity-50"
          >
            {CONVERTER_STATUSES.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>

        <div className="mt-6">
          <p className="text-sm font-medium text-slate-700">Configuration Schema</p>
          <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
            {JSON.stringify(manifest.configurationSchema, null, 2)}
          </pre>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <h2 className="font-semibold text-slate-950">Version History</h2>
        <p className="mt-1 text-sm text-slate-500">
          相同 Converter ID 的不可变版本。版本切换不会修改历史 Profile 的精确绑定。
        </p>
        <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {versions.map((item) => (
            <Link
              key={item.manifest.version}
              href={`/converters/${encodeURIComponent(item.manifest.converterId)}/${encodeURIComponent(item.manifest.version)}`}
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm hover:bg-slate-50"
            >
              <span className="font-mono text-slate-900">{item.manifest.version}</span>
              <span className="text-slate-500">
                {item.manifest.status} · {item.boundProfileCount} Profiles
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-sm text-slate-950 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
