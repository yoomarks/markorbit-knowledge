"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, PackageCheck, RefreshCw, Send } from "lucide-react";
import type { ReadyPackage } from "@markorbit/contracts";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";
import {
  coreContentActionRequiresOutboundTransport,
  coreIntakeActionRequiresOutboundTransport,
  isCoreContentActionable,
  isCoreIntakeActionable,
  type ContentTransportStatus,
  type TransportStatus,
} from "./ready-package-delivery-policy";

type CoreIntakeReceiptView = {
  intakeId: string;
  status: "RECEIVED" | "ACCEPTED" | "REJECTED";
  recordedAt: string;
};

type CoreIntakeSubmissionResultView = {
  intakeId: string;
  status: "RECEIVED" | "ACCEPTED" | "REJECTED";
  recordedAt: string;
};

type CoreIntakeSubmissionView = {
  submissionId: string;
  submittedAt: string;
  state: "PENDING" | "RESULT_RECORDED";
  transportResult?: CoreIntakeSubmissionResultView;
  result?: CoreIntakeSubmissionResultView;
};

type CoreContentResultView = {
  intakeId: string;
  readyPackageId: string;
  status: "ACCEPTED";
  exportSha256: string;
  recordedAt: string;
};

type CoreContentDeliveryView = {
  state: "PENDING" | "RESULT_RECORDED";
  coreIntakeId: string;
  requestSha256: string;
  transportResult?: CoreContentResultView;
  result?: CoreContentResultView;
  preparedAt: string;
  updatedAt: string;
};

type TransportReadiness = {
  configured: boolean;
  issueCode: string | null;
};

type CoreIntakeDetail = {
  readyPackageStatus: ReadyPackage["status"];
  transportStatus: TransportStatus;
  outboundTransport: TransportReadiness;
  latestCoreIntakeSubmission: CoreIntakeSubmissionView | null;
  latestCoreIntakeReceipt: CoreIntakeReceiptView | null;
  contentTransportStatus: ContentTransportStatus;
  contentOutboundTransport: TransportReadiness;
  coreContentDelivery: CoreContentDeliveryView | null;
  note: string;
  contentNote: string;
};

type ApiError = { error?: { message?: string } };
type DetailState = { readyPackageId: string; detail: CoreIntakeDetail };

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

async function requestReadyPackages(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<ReadyPackage[]> {
  const response = await fetch(
    `/api/ready-packages?${new URLSearchParams({ workspaceId }).toString()}`,
    { signal },
  );
  const body = (await response.json()) as { readyPackages?: ReadyPackage[] } | ApiError;
  if (!response.ok) throw new Error(readError(body, "Unable to load ReadyPackages"));
  return "readyPackages" in body ? (body.readyPackages ?? []) : [];
}

async function requestCoreIntakeDetail(
  workspaceId: string,
  readyPackageId: string,
  signal?: AbortSignal,
): Promise<CoreIntakeDetail> {
  const response = await fetch(
    `/api/ready-packages/${encodeURIComponent(readyPackageId)}/core-intake?${new URLSearchParams({ workspaceId }).toString()}`,
    { signal },
  );
  const body = (await response.json()) as CoreIntakeDetail | ApiError;
  if (!response.ok) throw new Error(readError(body, "Unable to load Core delivery status"));
  return body as CoreIntakeDetail;
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

function contentTone(status: ContentTransportStatus): string {
  if (status === "ACCEPTED") return "bg-emerald-50 text-emerald-800";
  if (status === "BLOCKED_REJECTED") return "bg-rose-50 text-rose-800";
  if (status === "CONTENT_PENDING_RESULT" || status === "CONTENT_FINALIZATION_PENDING") {
    return "bg-amber-50 text-amber-800";
  }
  if (status === "READY_TO_DELIVER") return "bg-sky-50 text-sky-800";
  return "bg-slate-100 text-slate-700";
}

function intakeActionLabel(status: TransportStatus): string {
  if (status === "SUBMISSION_PENDING_RESULT") return "重试同一提交";
  if (status === "SUBMISSION_FINALIZATION_PENDING") return "完成本地 Finalization";
  if (status === "REJECTED") return "再次提交至 Core";
  return "提交 Intake 至 Core";
}

function contentActionLabel(status: ContentTransportStatus): string {
  if (status === "CONTENT_PENDING_RESULT") return "重试同一 Content Export";
  if (status === "CONTENT_FINALIZATION_PENDING") return "完成 Content Finalization";
  return "冻结并提交 Content Export V1";
}

function formatDate(value: string | undefined): string {
  return value ? new Date(value).toLocaleString("zh-CN") : "—";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function ReadyPackageDeliveryWorkbench({ workspaceId }: { workspaceId: string }) {
  const [readyPackages, setReadyPackages] = useState<ReadyPackage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<DetailState | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittingIntake, setSubmittingIntake] = useState(false);
  const [submittingContent, setSubmittingContent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const selected = useMemo(
    () => readyPackages.find((readyPackage) => readyPackage.id === selectedId) ?? null,
    [readyPackages, selectedId],
  );
  const detail = detailState?.readyPackageId === selectedId ? detailState.detail : null;
  const detailLoading = Boolean(selectedId && !detail);

  useEffect(() => {
    const controller = new AbortController();
    void requestReadyPackages(workspaceId, controller.signal)
      .then((packages) => {
        setReadyPackages(packages);
        setSelectedId((current) =>
          current && packages.some((readyPackage) => readyPackage.id === current)
            ? current
            : (packages[0]?.id ?? null),
        );
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (isAbortError(requestError)) return;
        setError(
          requestError instanceof Error ? requestError.message : "Unable to load ReadyPackages",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [workspaceId]);

  useEffect(() => {
    if (!selectedId) return;
    const readyPackageId = selectedId;
    const controller = new AbortController();
    void requestCoreIntakeDetail(workspaceId, readyPackageId, controller.signal)
      .then((nextDetail) => {
        setDetailState({ readyPackageId, detail: nextDetail });
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (isAbortError(requestError)) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load Core delivery status",
        );
      });
    return () => controller.abort();
  }, [selectedId, workspaceId]);

  async function refreshPackages() {
    setLoading(true);
    setError(null);
    try {
      const packages = await requestReadyPackages(workspaceId);
      setReadyPackages(packages);
      setSelectedId((current) =>
        current && packages.some((readyPackage) => readyPackage.id === current)
          ? current
          : (packages[0]?.id ?? null),
      );
      if (selectedId) {
        const nextDetail = await requestCoreIntakeDetail(workspaceId, selectedId);
        setDetailState({ readyPackageId: selectedId, detail: nextDetail });
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to load ReadyPackages",
      );
    } finally {
      setLoading(false);
    }
  }

  async function refreshSelected(readyPackageId: string) {
    const [packages, nextDetail] = await Promise.all([
      requestReadyPackages(workspaceId),
      requestCoreIntakeDetail(workspaceId, readyPackageId),
    ]);
    setReadyPackages(packages);
    setDetailState({ readyPackageId, detail: nextDetail });
  }

  async function submitIntakeSelected() {
    if (
      !selected ||
      !detail ||
      !isCoreIntakeActionable(
        selected.status,
        detail.transportStatus,
        detail.outboundTransport.configured,
      )
    ) {
      return;
    }
    setSubmittingIntake(true);
    setError(null);
    setActionMessage(null);
    try {
      const response = await fetch(
        `/api/ready-packages/${encodeURIComponent(selected.id)}/core-intake/submit`,
        {
          method: "POST",
          headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({
            workspaceId,
            expectedDigest: selected.evidence.digest,
            submit: true,
          }),
        },
      );
      const body = (await response.json()) as Record<string, unknown> | ApiError;
      if (!response.ok) throw new Error(readError(body, "Core intake submission failed"));

      await refreshSelected(selected.id);
      setActionMessage("显式 Core intake 操作已完成；第二阶段 Content Export 仍需单独确认提交。");
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Core intake submission failed",
      );
      try {
        const nextDetail = await requestCoreIntakeDetail(workspaceId, selected.id);
        setDetailState({ readyPackageId: selected.id, detail: nextDetail });
      } catch {
        // Preserve the original submission error; the next manual refresh can retry evidence loading.
      }
    } finally {
      setSubmittingIntake(false);
    }
  }

  async function submitContentSelected() {
    if (
      !selected ||
      !detail ||
      !isCoreContentActionable(
        selected.status,
        detail.contentTransportStatus,
        detail.contentOutboundTransport.configured,
      )
    ) {
      return;
    }
    setSubmittingContent(true);
    setError(null);
    setActionMessage(null);
    try {
      const response = await fetch(
        `/api/ready-packages/${encodeURIComponent(selected.id)}/core-content/submit`,
        {
          method: "POST",
          headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({
            workspaceId,
            expectedDigest: selected.evidence.digest,
            submit: true,
          }),
        },
      );
      const body = (await response.json()) as Record<string, unknown> | ApiError;
      if (!response.ok) throw new Error(readError(body, "Core content submission failed"));

      await refreshSelected(selected.id);
      setActionMessage(
        "显式 Content Export V1 操作已完成；状态与 SHA-256 已从持久化交付证据重新读取。",
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Core content submission failed",
      );
      try {
        const nextDetail = await requestCoreIntakeDetail(workspaceId, selected.id);
        setDetailState({ readyPackageId: selected.id, detail: nextDetail });
      } catch {
        // Preserve the original submission error; the next manual refresh can retry evidence loading.
      }
    } finally {
      setSubmittingContent(false);
    }
  }

  const verifiedCount = readyPackages.filter((item) => item.status === "VERIFIED").length;
  const handedOffCount = readyPackages.filter((item) => item.status === "HANDED_OFF").length;
  const intakeActionable =
    selected !== null &&
    detail !== null &&
    isCoreIntakeActionable(
      selected.status,
      detail.transportStatus,
      detail.outboundTransport.configured,
    );
  const contentActionable =
    selected !== null &&
    detail !== null &&
    isCoreContentActionable(
      selected.status,
      detail.contentTransportStatus,
      detail.contentOutboundTransport.configured,
    );
  const intakeOutboundRequiredButUnavailable =
    detail !== null &&
    !detail.outboundTransport.configured &&
    coreIntakeActionRequiresOutboundTransport(detail.transportStatus);
  const contentOutboundRequiredButUnavailable =
    detail !== null &&
    !detail.contentOutboundTransport.configured &&
    coreContentActionRequiresOutboundTransport(detail.contentTransportStatus);

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
            onClick={() => void refreshPackages()}
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
                  className={
                    selectedId === readyPackage.id ? "bg-emerald-50/40" : "hover:bg-slate-50"
                  }
                >
                  <td className="px-5 py-4">
                    <p className="font-mono text-xs font-medium text-slate-900">
                      {readyPackage.id}
                    </p>
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
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(readyPackage.status)}`}
                    >
                      {readyPackage.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
                      onClick={() => {
                        setActionMessage(null);
                        setError(null);
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
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            正在读取 ReadyPackage Registry…
          </div>
        ) : null}
      </section>

      {selected ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Core delivery
              </p>
              <h2 className="mt-1 font-mono text-sm font-semibold text-slate-950">{selected.id}</h2>
            </div>
          </div>

          {detailLoading ? (
            <p className="mt-6 text-sm text-slate-500">正在读取 intake 与 content 交付证据…</p>
          ) : detail ? (
            <div className="mt-6 space-y-6">
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-950">Stage 1 · Core intake</h3>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${transportTone(detail.transportStatus)}`}
                  >
                    {detail.transportStatus}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                  {detail.note}
                </div>
                {intakeOutboundRequiredButUnavailable ? (
                  <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
                    <span>
                      当前 intake 动作需要 Core outbound HTTP，但本地 destination 配置未通过校验（
                      {detail.outboundTransport.issueCode ?? "CORE_INTAKE_TRANSPORT_NOT_CONFIGURED"}
                      ）。该动作已禁用；已有 transport result 的纯本地 finalization 不受影响。
                    </span>
                  </div>
                ) : null}
                <div className="grid gap-3 md:grid-cols-4">
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
                    detail={
                      detail.latestCoreIntakeSubmission?.transportResult?.intakeId ??
                      "尚无 Core result"
                    }
                  />
                  <EvidenceCard
                    label="Latest receipt"
                    value={detail.latestCoreIntakeReceipt?.status ?? "—"}
                    detail={detail.latestCoreIntakeReceipt?.intakeId ?? "尚无 receipt"}
                  />
                  <EvidenceCard
                    label="Intake outbound config"
                    value={detail.outboundTransport.configured ? "CONFIGURED" : "NOT_CONFIGURED"}
                    detail={
                      detail.outboundTransport.configured
                        ? "本地 destination/auth/binding 已通过校验；可达性仍在 submit 时验证。"
                        : (detail.outboundTransport.issueCode ?? "配置不可用")
                    }
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
                  <p className="max-w-2xl text-xs leading-5 text-slate-500">
                    Intake PENDING 会复用同一 submittedAt、Core Workspace 与 idempotency
                    key；已持久化 transport result 的 finalization 不会再次提交到 Core。完成 intake
                    不会自动触发 Content Export。
                  </p>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={
                      !intakeActionable || submittingIntake || submittingContent || detailLoading
                    }
                    onClick={() => void submitIntakeSelected()}
                  >
                    <Send size={16} aria-hidden="true" />
                    {submittingIntake ? "处理中…" : intakeActionLabel(detail.transportStatus)}
                  </button>
                </div>
              </div>

              <div className="space-y-5 border-t border-slate-200 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-950">
                    Stage 2 · ReadyPackage Content Export V1
                  </h3>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${contentTone(detail.contentTransportStatus)}`}
                  >
                    {detail.contentTransportStatus}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                  {detail.contentNote}
                </div>
                {contentOutboundRequiredButUnavailable ? (
                  <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
                    <span>
                      当前 Content Export 动作需要 Core outbound HTTP，但 destination/auth
                      配置未通过校验（
                      {detail.contentOutboundTransport.issueCode ??
                        "CORE_CONTENT_TRANSPORT_NOT_CONFIGURED"}
                      ）。已持久化 transport result 的纯本地 finalization 仍可继续，而且不依赖当前
                      Workspace binding。
                    </span>
                  </div>
                ) : null}
                <div className="grid gap-3 md:grid-cols-4">
                  <EvidenceCard
                    label="Core intake ID"
                    value={
                      detail.coreContentDelivery?.coreIntakeId ??
                      detail.latestCoreIntakeSubmission?.result?.intakeId ??
                      detail.latestCoreIntakeReceipt?.intakeId ??
                      "—"
                    }
                    detail={
                      detail.coreContentDelivery
                        ? `Frozen ${formatDate(detail.coreContentDelivery.preparedAt)}`
                        : "Content request 尚未冻结"
                    }
                  />
                  <EvidenceCard
                    label="Frozen export SHA-256"
                    value={detail.coreContentDelivery?.requestSha256 ?? "—"}
                    detail="只显示持久化 fingerprint，不在状态界面回传 canonical content body。"
                  />
                  <EvidenceCard
                    label="Content transport result"
                    value={detail.coreContentDelivery?.transportResult?.status ?? "—"}
                    detail={
                      detail.coreContentDelivery?.transportResult
                        ? `${detail.coreContentDelivery.transportResult.exportSha256} · ${formatDate(detail.coreContentDelivery.transportResult.recordedAt)}`
                        : "尚无 Core content transport result"
                    }
                  />
                  <EvidenceCard
                    label="Content outbound config"
                    value={
                      detail.contentOutboundTransport.configured ? "CONFIGURED" : "NOT_CONFIGURED"
                    }
                    detail={
                      detail.contentOutboundTransport.configured
                        ? "destination/auth 已通过本地校验；不要求当前 Workspace binding。"
                        : (detail.contentOutboundTransport.issueCode ?? "配置不可用")
                    }
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
                  <p className="max-w-2xl text-xs leading-5 text-slate-500">
                    Content Export 是显式第二阶段：首次操作先把 canonical V1 JSON 与 SHA-256 冻结到
                    durable submission，再发送 HTTP。未知结果只重试同一 frozen body；transport
                    result 已持久化时只做本地 finalization。不会自动提交，也不会把语义理解移入
                    Knowledge。
                  </p>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={
                      !contentActionable || submittingContent || submittingIntake || detailLoading
                    }
                    onClick={() => void submitContentSelected()}
                  >
                    <Send size={16} aria-hidden="true" />
                    {submittingContent
                      ? "处理中…"
                      : contentActionLabel(detail.contentTransportStatus)}
                  </button>
                </div>
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
