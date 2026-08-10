"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, PackageCheck, RefreshCw, Send } from "lucide-react";
import type { ReadyPackage } from "@markorbit/contracts";

type TransportStatus =
  | "NOT_SUBMITTED"
  | "SUBMISSION_PENDING_RESULT"
  | "SUBMISSION_FINALIZATION_PENDING"
  | "ACKNOWLEDGED"
  | "REJECTED"
  | "HANDED_OFF_WITHOUT_RECEIPT";

type CoreIntakeReceiptView = {
  intakeId: string;
  status: "RECEIVED" | "ACCEPTED" | "REJECTED";
  recordedAt: string;
};

type CoreIntakeSubmissionView = {
  submissionId: string;
  submittedAt: string;
  state: "PENDING" | "RESULT_RECORDED";
  transportResult?: {
    intakeId: string;
    status: "RECEIVED" | "ACCEPTED" | "REJECTED";
    recordedAt: string;
  };
};

type CoreIntakeDetail = {
  readyPackageStatus: ReadyPackage["status"];
  transportStatus: TransportStatus;
  latestCoreIntakeSubmission: CoreIntakeSubmissionView | null;
  latestCoreIntakeReceipt: CoreIntakeReceiptView | null;
  note: string;
};

type ApiError = { error?: { message?: string } };

function readError(body: unknown, fallback: string): string {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    body.error &&
    typeof body.error === "object" &&
    "message" in body.error &&
    typeof body.error.message === "string"
  ) {
    return body.error.message;
  }
  return fallback;
}

function statusTone(status: ReadyPackage["status"]): string {
  if (status === "HANDED_OFF") return "bg-emerald-50 text-emerald-800";
  if (status === "VERIFIED") return "bg-sky-50 text-sky-800";
  return "bg-slate-100 text-slate-700";
}

function transportTone(status: TransportStatus): string {
  if (status === "ACKNOWLEDGED") return "bg-emerald-50 text-emerald-800";
  if (status === "REJECTED") return "bg-rose-50 text-rose-800";
  if (status === "SUBMISSION_PENDING_RESULT" || status === "SUBMISSION_FINALIZATION_PENDING") {
    return "bg-amber-50 text-amber-800";
  }
  return "bg-slate-100 text-slate-700";
}

function actionLabel(status: TransportStatus): string {
  if (status === "SUBMISSION_PENDING_RESULT") return "重试同一提交";
  if (status === "SUBMISSION_FINALIZATION_PENDING") return "完成本地 Finalization";
  if (status === "REJECTED") return "再次提交至 Core";
  return "提交至 Core";
}

function formatDate(value: string | undefined): string {
  return value ? new Date(value).toLocaleString("zh-CN") : "—";
}

export function ReadyPackageDeliveryWorkbench({ workspaceId }: { workspaceId: string }) {
  const [readyPackages, setReadyPackages] = useState<ReadyPackage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CoreIntakeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const selected = useMemo(
    () => readyPackages.find((readyPackage) => readyPackage.id === selectedId) ?? null,
    [readyPackages, selectedId],
  );

  const loadPackages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/ready-packages?${new URLSearchParams({ workspaceId }).toString()}`,
      );
      const body = (await response.json()) as { readyPackages?: ReadyPackage[] } | ApiError;
      if (!response.ok) throw new Error(readError(body, "Unable to load ReadyPackages"));
      const packages = "readyPackages" in body ? (body.readyPackages ?? []) : [];
      setReadyPackages(packages);
      setSelectedId((current) =>
        current && packages.some((readyPackage) => readyPackage.id === current)
          ? current
          : (packages[0]?.id ?? null),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to load ReadyPackages",
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const loadDetail = useCallback(
    async (readyPackageId: string) => {
      setDetailLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/ready-packages/${encodeURIComponent(readyPackageId)}/core-intake?${new URLSearchParams({ workspaceId }).toString()}`,
        );
        const body = (await response.json()) as CoreIntakeDetail | ApiError;
        if (!response.ok) throw new Error(readError(body, "Unable to load Core intake status"));
        setDetail(body as CoreIntakeDetail);
      } catch (requestError) {
        setDetail(null);
        setError(
          requestError instanceof Error ? requestError.message : "Unable to load Core intake status",
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [workspaceId],
  );

  useEffect(() => {
    void loadPackages();
  }, [loadPackages]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedId);
  }, [loadDetail, selectedId]);

  async function submitSelected() {
    if (!selected || !detail || selected.status !== "VERIFIED") return;
    setSubmitting(true);
    setError(null);
    setActionMessage(null);
    try {
      const response = await fetch(
        `/api/ready-packages/${encodeURIComponent(selected.id)}/core-intake/submit`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            expectedDigest: selected.evidence.digest,
            submit: true,
          }),
        },
      );
      const body = (await response.json()) as Record<string, unknown> | ApiError;
      if (!response.ok) throw new Error(readError(body, "Core intake submission failed"));
      setActionMessage("显式 Core intake 操作已完成；状态已从持久化证据重新读取。");
      await loadPackages();
      await loadDetail(selected.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Core intake submission failed");
      await loadDetail(selected.id);
    } finally {
      setSubmitting(false);
    }
  }

  const verifiedCount = readyPackages.filter((item) => item.status === "VERIFIED").length;
  const handedOffCount = readyPackages.filter((item) => item.status === "HANDED_OFF").length;
  const actionable =
    selected?.status === "VERIFIED" &&
    detail !== null &&
    detail.transportStatus !== "ACKNOWLEDGED" &&
    detail.transportStatus !== "HANDED_OFF_WITHOUT_RECEIPT";

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["ReadyPackages", readyPackages.length],
          ["待交付 / 待处理", verifiedCount],
          ["已记录 Handoff", handedOffCount],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-950">ReadyPackage Delivery Queue</h2>
            <p className="mt-1 text-sm text-slate-500">
              工作区 {workspaceId} · 只显示已持久化的 ReadyPackage 证据。
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
            onClick={() => void loadPackages()}
            disabled={loading}
          >
            <RefreshCw size={16} aria-hidden="true" />
            刷新
          </button>
        </div>

        {error ? (
          <div className="m-5 flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}
        {actionMessage ? (
          <div className="m-5 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <CheckCircle2 className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
            <span>{actionMessage}</span>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Package</th>
                <th className="px-5 py-3 font-medium">Evidence</th>
                <th className="px-5 py-3 font-medium">Created</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {readyPackages.map((readyPackage) => (
                <tr
                  key={readyPackage.id}
                  className={selectedId === readyPackage.id ? "bg-emerald-50/40" : "hover:bg-slate-50"}
                >
                  <td className="px-5 py-4">
                    <p className="font-mono text-xs font-medium text-slate-900">{readyPackage.id}</p>
                    <p className="mt-1 font-mono text-xs text-slate-500">
                      {readyPackage.evidence.conversionRunId ?? "no conversionRunId"}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-mono text-xs text-slate-700">
                      {readyPackage.evidence.stagingDocumentId}
                    </p>
                    <p
                      className="mt-1 max-w-64 truncate font-mono text-xs text-slate-500"
                      title={readyPackage.evidence.digest}
                    >
                      {readyPackage.evidence.digest}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{formatDate(readyPackage.createdAt)}</td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(readyPackage.status)}`}>
                      {readyPackage.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
                      onClick={() => {
                        setActionMessage(null);
                        setSelectedId(readyPackage.id);
                      }}
                    >
                      查看交付状态
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && readyPackages.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <PackageCheck className="mx-auto text-slate-400" size={32} aria-hidden="true" />
            <h3 className="mt-4 font-semibold text-slate-950">尚无 ReadyPackage</h3>
            <p className="mt-2 text-sm text-slate-500">
              只有通过 verified staging finalization 的证据包才会出现在这里。
            </p>
          </div>
        ) : null}
        {loading ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">正在读取 ReadyPackage Registry…</div>
        ) : null}
      </section>

      {selected ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Core intake</p>
              <h2 className="mt-1 font-mono text-sm font-semibold text-slate-950">{selected.id}</h2>
            </div>
            {detail ? (
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${transportTone(detail.transportStatus)}`}>
                {detail.transportStatus}
              </span>
            ) : null}
          </div>

          {detailLoading ? (
            <p className="mt-6 text-sm text-slate-500">正在读取提交与 receipt 证据…</p>
          ) : detail ? (
            <div className="mt-6 space-y-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                {detail.note}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <EvidenceCard
                  label="Latest submission"
                  value={detail.latestCoreIntakeSubmission?.submissionId ?? "—"}
                  detail={
                    detail.latestCoreIntakeSubmission
                      ? `${detail.latestCoreIntakeSubmission.state} · ${formatDate(detail.latestCoreIntakeSubmission.submittedAt)}`
                      : "尚无持久化 submission"
                  }
                />
                <EvidenceCard
                  label="Transport result"
                  value={detail.latestCoreIntakeSubmission?.transportResult?.status ?? "—"}
                  detail={detail.latestCoreIntakeSubmission?.transportResult?.intakeId ?? "尚无 Core result"}
                />
                <EvidenceCard
                  label="Latest receipt"
                  value={detail.latestCoreIntakeReceipt?.status ?? "—"}
                  detail={detail.latestCoreIntakeReceipt?.intakeId ?? "尚无 receipt"}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
                <p className="max-w-2xl text-xs leading-5 text-slate-500">
                  此动作只调用现有显式 Core intake submit/retry 边界。PENDING 会复用同一 submittedAt 与 idempotency key；已持久化 transport result 的 finalization 不会再次提交到 Core。
                </p>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!actionable || submitting || detailLoading}
                  onClick={() => void submitSelected()}
                >
                  <Send size={16} aria-hidden="true" />
                  {submitting ? "处理中…" : actionLabel(detail.transportStatus)}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function EvidenceCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 break-all font-mono text-xs font-semibold text-slate-900">{value}</p>
      <p className="mt-2 break-all text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}
