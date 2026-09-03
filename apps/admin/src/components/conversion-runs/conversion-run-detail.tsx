"use client";
import { useEffect, useState } from "react";
import type { ConversionExecutionEvent, ConversionRun } from "@markorbit/contracts";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";
type Record = { run: ConversionRun; events: ConversionExecutionEvent[] };
export function ConversionRunDetail({ runId }: { runId: string }) {
  const [record, setRecord] = useState<Record | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const workspaceId =
      new URLSearchParams(window.location.search).get("workspaceId") ??
      "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
    fetch(`/api/conversion-runs/${runId}?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        return response.json() as Promise<Record>;
      })
      .then(setRecord)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Failed"));
  }, [runId]);
  async function cancel() {
    if (!record || !confirm("Cancel this PENDING ConversionRun?")) return;
    const headers = await adminBrowserMutationHeaders({ "Content-Type": "application/json" });
    const res = await fetch(`/api/conversion-runs/${runId}/cancel`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        workspaceId: record.run.workspaceId,
        message: "Cancelled by admin",
      }),
    });
    if (res.ok) {
      setRecord((await res.json()) as Record);
    } else setError(await res.text());
  }
  if (error)
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  if (!record)
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        加载 ConversionRun…
      </div>
    );
  const r = record.run;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Awaiting conversion runtime</strong>：当前只展示控制面 intent、快照和事件证据。
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex justify-between">
          <h2 className="text-lg font-semibold">{r.id}</h2>
          {r.status === "PENDING" ? (
            <button
              onClick={cancel}
              className="rounded-xl border border-red-300 px-3 py-2 text-sm text-red-700"
            >
              Cancel PENDING run
            </button>
          ) : null}
        </div>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div>Status: {r.status}</div>
          <div>
            Actor: {r.actor.type}/{r.actor.id}
          </div>
          <div>Trigger: {r.trigger}</div>
          <div>Idempotency: {r.idempotencyKey}</div>
          <div>Artifact: {r.rawArtifactId}</div>
          <div>Source: {r.sourceId}</div>
          <div>
            Input: {r.input.artifactKind} {r.input.mimeType} {r.input.sha256} {r.input.sizeBytes}{" "}
            bytes
          </div>
          <div>
            Converter: {r.converter.converterId}@{r.converter.version}
          </div>
          <div>
            Output: {r.requestedOutput.format} → {r.requestedOutput.targetPathTemplate}
          </div>
        </dl>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <pre className="overflow-auto rounded-2xl border bg-white p-4 text-xs">
          {JSON.stringify(r.conversionProfileSnapshot, null, 2)}
        </pre>
        <pre className="overflow-auto rounded-2xl border bg-white p-4 text-xs">
          {JSON.stringify(r.converterManifestSnapshot, null, 2)}
        </pre>
      </div>
      <div className="rounded-2xl border bg-white p-6">
        <h3 className="font-semibold">Append-only event timeline</h3>
        <ol className="mt-3 space-y-2">
          {record.events.map((e) => (
            <li key={e.id} className="rounded-xl bg-slate-50 p-3 text-sm">
              <span className="font-mono">#{e.sequence}</span> {e.eventType}:{" "}
              {e.previousStatus ?? "null"} → {e.resultingStatus} at {e.occurredAt}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
