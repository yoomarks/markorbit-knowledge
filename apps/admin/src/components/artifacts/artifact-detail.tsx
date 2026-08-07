"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, FileStack, ShieldCheck } from "lucide-react";
import type { RawArtifactView, ArtifactSessionRecord } from "@markorbit/persistence/raw-artifacts";

export function ArtifactDetail({ artifactId }: { artifactId: string }) {
  const [view, setView] = useState<RawArtifactView | null>(null);
  const [session, setSession] = useState<ArtifactSessionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/artifacts/${artifactId}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as {
          artifact?: RawArtifactView;
          error?: { message?: string };
        };
        if (!response.ok || !body.artifact)
          throw new Error(body.error?.message ?? "Unable to load artifact");
        setView(body.artifact);
        return fetch(`/api/artifacts/sessions/${body.artifact.sessionId}`, {
          signal: controller.signal,
        });
      })
      .then(async (response) => {
        const body = (await response.json()) as {
          record?: ArtifactSessionRecord;
          error?: { message?: string };
        };
        if (!response.ok || !body.record)
          throw new Error(body.error?.message ?? "Unable to load ingestion evidence");
        setSession(body.record);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load artifact");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [artifactId]);

  if (loading)
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        正在读取不可变文件证据…
      </div>
    );
  if (!view)
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        {error ?? "RawArtifact 不存在。"}
      </div>
    );

  const artifact = view.artifact;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/artifacts"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft size={17} /> 返回文件与版本
        </Link>
        <a
          href={`/api/artifacts/${artifact.id}/content`}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white"
        >
          <Download size={17} /> 受控下载
        </a>
      </div>
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
        内容仅以附件形式下载，并应用 nosniff 与 sandbox 响应头。系统不会直接渲染
        HTML，也不会执行上传内容。
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-slate-100 text-slate-700">
              <FileStack size={22} />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                RawArtifact
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-950">{artifact.originalName}</h2>
              <p className="mt-1 font-mono text-xs text-slate-500">{artifact.id}</p>
            </div>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
            {artifact.status}
          </span>
        </div>
        <dl className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="类型" value={`${artifact.artifactKind} · ${artifact.mimeType}`} />
          <Field label="大小" value={`${artifact.sizeBytes.toLocaleString()} bytes`} />
          <Field label="版本" value={`v${artifact.version}`} />
          <Field label="捕获时间" value={new Date(artifact.capturedAt).toLocaleString("zh-CN")} />
          <Field label="数据源" value={artifact.sourceId} />
          <Field label="运行" value={artifact.collectionRunId ?? "—"} />
          <Field label="Job" value={`${view.jobId} / attempt ${view.jobAttempt}`} />
          <Field label="Execution" value={view.executionAttemptId} />
        </dl>
      </section>
      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="flex items-center gap-2 font-semibold text-slate-950">
            <ShieldCheck size={18} /> 内容身份
          </h3>
          <dl className="mt-5 space-y-4">
            <Field label="SHA-256" value={view.contentObject.sha256} mono />
            <Field label="Storage URI" value={view.contentObject.storageUri} mono />
            <Field label="物理引用数" value={String(view.contentObject.referenceCount)} />
            <Field
              label="验证时间"
              value={new Date(view.contentObject.verifiedAt).toLocaleString("zh-CN")}
            />
          </dl>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-slate-950">Provenance</h3>
          <dl className="mt-5 space-y-4">
            <Field label="Source URI" value={artifact.provenance.sourceUri} />
            <Field label="Canonical URI" value={artifact.canonicalUri ?? "—"} />
            <Field
              label="Connector"
              value={`${artifact.collector.connectorId}@${artifact.collector.connectorVersion}`}
            />
            <Field
              label="Worker / Session"
              value={`${artifact.collector.workerId ?? "—"} / ${view.sessionId}`}
            />
          </dl>
        </div>
      </section>
      {session ? (
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="font-semibold text-slate-950">Ingestion audit timeline</h3>
            <p className="mt-1 text-sm text-slate-500">追加式上传、校验和 finalize 证据。</p>
          </div>
          <ol className="divide-y divide-slate-100">
            {session.events.map((event) => (
              <li key={event.id} className="px-5 py-4">
                <p className="text-sm font-medium text-slate-900">
                  #{event.sequence} · {event.eventType}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(event.recordedAt).toLocaleString("zh-CN")}
                </p>
                {event.failure ? (
                  <p className="mt-2 text-sm text-rose-700">
                    {event.failure.code}: {event.failure.message}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <details className="rounded-2xl border border-slate-200 bg-white p-5">
        <summary className="cursor-pointer font-semibold text-slate-950">
          Canonical RawArtifact JSON
        </summary>
        <pre className="mt-4 max-h-[520px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">
          {JSON.stringify(artifact, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className={`mt-1 break-all text-sm text-slate-900 ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
