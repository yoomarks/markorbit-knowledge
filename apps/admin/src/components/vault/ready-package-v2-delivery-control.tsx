"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { History, RefreshCw, Send, ShieldAlert, Snowflake, Stethoscope } from "lucide-react";
import type { ReadyPackageV2 } from "@markorbit/contracts";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";

type DeliveryStage =
  | "NOT_PREPARED"
  | "SAFE_TO_SUBMIT"
  | "OUTCOME_UNKNOWN_RETRY_EXACT_REQUEST"
  | "LOCAL_FINALIZATION_REQUIRED"
  | "DELIVERED"
  | "CONSUMER_REJECTED"
  | "EVIDENCE_INCONSISTENT";

type RecommendedAction =
  | "SUBMIT_FROZEN_REQUEST"
  | "RETRY_EXACT_FROZEN_REQUEST"
  | "FINALIZE_LOCALLY_NO_NETWORK"
  | "NONE_DELIVERED"
  | "OPERATOR_REVIEW_CONSUMER_REJECTION"
  | "BLOCK_AND_REVIEW_EVIDENCE";

type Diagnosis = {
  state: Exclude<DeliveryStage, "NOT_PREPARED">;
  recommendedAction: RecommendedAction;
  issues: Array<{ code: string; message: string; sequence?: number }>;
  evidence: {
    auditEventCount: number;
    transportAttemptCount: number;
    lastAttemptNumber: number | null;
    consumerResultStatus: "RECEIVED" | "ACCEPTED" | "REJECTED" | null;
    finalizedResultStatus: "RECEIVED" | "ACCEPTED" | "REJECTED" | null;
  };
};

type ResultEvidence = {
  status: "RECEIVED" | "ACCEPTED" | "REJECTED";
  recordedAt: string;
  requestSha256: string;
};

type AuditEvent = {
  workspaceId: string;
  submissionId: string;
  readyPackageId: string;
  sequence: number;
  type:
    | "PREPARED"
    | "TRANSPORT_ATTEMPT_STARTED"
    | "TRANSPORT_OUTCOME_UNKNOWN"
    | "TRANSPORT_RESULT_RECORDED"
    | "FINALIZED";
  requestSha256: string;
  recordedAt: string;
  attemptNumber?: number;
  issueCode?: string;
  httpStatus?: number;
  resultStatus?: "RECEIVED" | "ACCEPTED" | "REJECTED";
};

type Submission = {
  submissionId: string;
  workspaceId: string;
  readyPackageId: string;
  readyPackageDigest: string;
  coreWorkspaceId: string;
  requestSha256: string;
  contentExportSha256: string;
  state: "PENDING" | "RESULT_RECORDED";
  transportAttempts: number;
  lastTransportAttemptedAt?: string;
  transportResult?: ResultEvidence;
  result?: ResultEvidence;
  createdAt: string;
  updatedAt: string;
};

type OverviewItem = {
  readyPackage: ReadyPackageV2;
  stage: DeliveryStage;
  diagnosis: Diagnosis | null;
  submission: Submission | null;
  auditEvents: AuditEvent[];
  outboundTransport: { configured: boolean; issueCode: string | null };
};

type Overview = {
  currentCoreWorkspaceId: string | null;
  items: OverviewItem[];
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

function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function stageLabel(stage: DeliveryStage, status?: ResultEvidence["status"]): string {
  if (stage === "NOT_PREPARED") return "未冻结";
  if (stage === "SAFE_TO_SUBMIT") return "证据一致 · 可首次提交";
  if (stage === "OUTCOME_UNKNOWN_RETRY_EXACT_REQUEST") return "结果未知 · 仅可原样重试";
  if (stage === "LOCAL_FINALIZATION_REQUIRED") return "Consumer result 已落盘 · 仅需本地收敛";
  if (stage === "CONSUMER_REJECTED") return "Consumer 已拒绝 · 需人工处理";
  if (stage === "EVIDENCE_INCONSISTENT") return "证据不一致 · 自动化已阻断";
  return status ? `已交付 · ${status}` : "已交付";
}

function actionLabel(action: RecommendedAction): string {
  if (action === "SUBMIT_FROZEN_REQUEST") return "提交已冻结请求";
  if (action === "RETRY_EXACT_FROZEN_REQUEST") return "仅重试完全相同的冻结请求";
  if (action === "FINALIZE_LOCALLY_NO_NETWORK") return "仅执行本地 Finalization，不再外发";
  if (action === "NONE_DELIVERED") return "无需操作";
  if (action === "OPERATOR_REVIEW_CONSUMER_REJECTION")
    return "人工审查 Consumer 拒绝原因；不要自动重试";
  return "阻断自动化并人工核验证据；不要修补或自动重试";
}

function auditLabel(event: AuditEvent): string {
  if (event.type === "PREPARED") return "冻结请求";
  if (event.type === "TRANSPORT_ATTEMPT_STARTED") {
    return `Transport attempt #${event.attemptNumber ?? "?"} 已开始`;
  }
  if (event.type === "TRANSPORT_OUTCOME_UNKNOWN") {
    return `Attempt #${event.attemptNumber ?? "?"} 结果未知`;
  }
  if (event.type === "TRANSPORT_RESULT_RECORDED") {
    return `Transport result 已落盘 · ${event.resultStatus ?? "—"}`;
  }
  return `本地 Finalization 完成 · ${event.resultStatus ?? "—"}`;
}

function auditDetail(event: AuditEvent): string | null {
  if (event.type === "TRANSPORT_OUTCOME_UNKNOWN") {
    return `${event.issueCode ?? "UNKNOWN"}${event.httpStatus ? ` · ${event.httpStatus}` : ""}`;
  }
  if (
    event.attemptNumber !== undefined &&
    (event.type === "TRANSPORT_RESULT_RECORDED" || event.type === "FINALIZED")
  ) {
    return `attempt #${event.attemptNumber}`;
  }
  return null;
}

function auditTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("zh-CN", { hour12: false });
}

async function loadOverview(workspaceId: string): Promise<Overview> {
  const response = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/ready-package-v2-deliveries`,
  );
  const body = (await response.json()) as Overview | ApiError;
  if (!response.ok) throw new Error(readError(body, "Unable to load V2 delivery state"));
  return body as Overview;
}

function subscribeLocationSearch(): () => void {
  return () => undefined;
}

function readLocationSearch(): string {
  return window.location.search;
}

function readServerLocationSearch(): string {
  return "";
}

export function ReadyPackageV2DeliveryControl({ workspaceId }: { workspaceId: string }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locationSearch = useSyncExternalStore(
    subscribeLocationSearch,
    readLocationSearch,
    readServerLocationSearch,
  );
  const focusReadyPackageId = useMemo(
    () => new URLSearchParams(locationSearch).get("readyPackageId")?.trim() || null,
    [locationSearch],
  );

  function applyLoaded(value: Overview) {
    setOverview(value);
    setError(null);
    setLoading(false);
  }

  async function refresh() {
    setLoading(true);
    try {
      applyLoaded(await loadOverview(workspaceId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to refresh state");
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void loadOverview(workspaceId).then(
      (value) => {
        if (active) applyLoaded(value);
      },
      (requestError: unknown) => {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load state");
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [workspaceId]);

  async function action(readyPackageId: string, actionName: "PREPARE" | "SUBMIT") {
    setActing(`${readyPackageId}:${actionName}`);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/ready-package-v2-deliveries`,
        {
          method: "POST",
          headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ action: actionName, readyPackageId }),
        },
      );
      const body = (await response.json()) as { submission?: Submission } | ApiError;
      if (!response.ok) {
        throw new Error(
          readError(
            body,
            actionName === "PREPARE" ? "V2 delivery preparation failed" : "V2 delivery failed",
          ),
        );
      }
      applyLoaded(await loadOverview(workspaceId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "V2 delivery action failed");
      try {
        setOverview(await loadOverview(workspaceId));
      } catch {
        // Keep the original action error visible if status refresh also fails.
      }
    } finally {
      setActing(null);
    }
  }

  const visibleItems = focusReadyPackageId
    ? (overview?.items.filter((item) => item.readyPackage.id === focusReadyPackageId) ?? [])
    : (overview?.items ?? []);
  const focusMissing = Boolean(focusReadyPackageId && overview && visibleItems.length === 0);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-950">
            <Send size={19} aria-hidden="true" />
            <h2 className="font-semibold">ReadyPackage V2 Delivery</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            K16 只读重建 K14 冻结请求与 K15 append-only audit 证据，给出可操作诊断。任何证据冲突都
            fail-closed；系统不会自动修复历史、自动重试或猜测已经交付。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || acting !== null}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
        >
          <RefreshCw size={16} aria-hidden="true" />
          刷新
        </button>
      </div>

      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
          <p>
            V2 仍绝不会复用现有 V1 Core intake URL。诊断只读取冻结元数据与有限 audit evidence；不会
            暴露 URL、密钥、idempotency key、Markdown 或 request
            body。证据不一致时所有外发操作均被阻断。
          </p>
        </div>
      </div>

      {focusReadyPackageId ? (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            focusMissing
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-sky-200 bg-sky-50 text-sky-800"
          }`}
        >
          <p className="font-semibold">Operator Inbox delivery focus</p>
          <p className="mt-1 break-all text-xs">{focusReadyPackageId}</p>
          {focusMissing ? (
            <p className="mt-1 text-xs">
              指定 ReadyPackage V2 不在当前 Workspace delivery evidence 中；未回退显示其他记录。
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="mt-6 space-y-3 border-t border-slate-100 pt-5">
        {!visibleItems.length ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
            {loading
              ? "加载中…"
              : focusReadyPackageId
                ? "没有与 Operator Inbox 深链完全匹配的 ReadyPackage V2 delivery record。"
                : "尚无 ReadyPackage V2 可进入 delivery foundation。"}
          </div>
        ) : null}

        {visibleItems.map((item) => {
          const submission = item.submission;
          const diagnosis = item.diagnosis;
          const preparing = acting === `${item.readyPackage.id}:PREPARE`;
          const submitting = acting === `${item.readyPackage.id}:SUBMIT`;
          const canPrepare =
            item.stage === "NOT_PREPARED" && overview?.currentCoreWorkspaceId !== null;
          const canSubmit =
            item.stage === "LOCAL_FINALIZATION_REQUIRED" ||
            ((item.stage === "SAFE_TO_SUBMIT" ||
              item.stage === "OUTCOME_UNKNOWN_RETRY_EXACT_REQUEST") &&
              item.outboundTransport.configured);
          const submitLabel =
            item.stage === "LOCAL_FINALIZATION_REQUIRED"
              ? "完成本地 Finalization"
              : item.stage === "OUTCOME_UNKNOWN_RETRY_EXACT_REQUEST"
                ? "重试完全相同的 V2 请求"
                : "提交冻结的 V2 请求";
          const showSubmit =
            item.stage === "SAFE_TO_SUBMIT" ||
            item.stage === "OUTCOME_UNKNOWN_RETRY_EXACT_REQUEST" ||
            item.stage === "LOCAL_FINALIZATION_REQUIRED";

          return (
            <div key={item.readyPackage.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="break-all text-sm font-medium text-slate-900">
                    {item.readyPackage.id}
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-600">
                    {stageLabel(item.stage, submission?.result?.status)}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-slate-500">
                    package digest {shortHash(item.readyPackage.evidence.digest)}
                  </p>
                  {submission ? (
                    <>
                      <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                        <p className="break-all">delivery {submission.submissionId}</p>
                        <p className="break-all">Core Workspace {submission.coreWorkspaceId}</p>
                        <p>request {shortHash(submission.requestSha256)}</p>
                        <p>content export {shortHash(submission.contentExportSha256)}</p>
                        <p>transport attempts {submission.transportAttempts}</p>
                        <p>
                          result{" "}
                          {submission.result?.status ?? submission.transportResult?.status ?? "—"}
                        </p>
                      </div>

                      {diagnosis ? (
                        <div
                          className={`mt-4 rounded-xl border p-3 ${
                            diagnosis.state === "EVIDENCE_INCONSISTENT" ||
                            diagnosis.state === "CONSUMER_REJECTED"
                              ? "border-rose-200 bg-rose-50/70"
                              : "border-sky-200 bg-sky-50/60"
                          }`}
                        >
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                            <Stethoscope size={15} aria-hidden="true" />
                            Operational diagnosis · {diagnosis.state}
                          </div>
                          <p className="mt-2 text-xs leading-5 text-slate-700">
                            建议动作：{actionLabel(diagnosis.recommendedAction)}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            evidence: {diagnosis.evidence.auditEventCount} events ·{" "}
                            {diagnosis.evidence.transportAttemptCount} attempts
                            {diagnosis.evidence.consumerResultStatus
                              ? ` · consumer ${diagnosis.evidence.consumerResultStatus}`
                              : ""}
                            {diagnosis.evidence.finalizedResultStatus
                              ? ` · finalized ${diagnosis.evidence.finalizedResultStatus}`
                              : ""}
                          </p>
                          {diagnosis.issues.length ? (
                            <div className="mt-2 space-y-1">
                              {diagnosis.issues.map((diagnosticIssue, index) => (
                                <p
                                  key={`${diagnosticIssue.code}:${diagnosticIssue.sequence ?? "none"}:${index}`}
                                  className="break-words font-mono text-[11px] leading-5 text-rose-800"
                                >
                                  {diagnosticIssue.code}
                                  {diagnosticIssue.sequence
                                    ? ` @ #${diagnosticIssue.sequence}`
                                    : ""}
                                  : {diagnosticIssue.message}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                          <History size={15} aria-hidden="true" />
                          Delivery audit timeline
                        </div>
                        <div className="mt-3 space-y-2">
                          {item.auditEvents.length ? (
                            item.auditEvents.map((event) => {
                              const detail = auditDetail(event);
                              return (
                                <div
                                  key={`${event.submissionId}:${event.sequence}`}
                                  className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs"
                                >
                                  <div className="min-w-0">
                                    <p className="font-medium text-slate-800">
                                      #{event.sequence} · {auditLabel(event)}
                                    </p>
                                    {detail ? (
                                      <p className="mt-0.5 break-all font-mono text-[11px] text-slate-500">
                                        {detail}
                                      </p>
                                    ) : null}
                                  </div>
                                  <time className="shrink-0 text-[11px] text-slate-500">
                                    {auditTimestamp(event.recordedAt)}
                                  </time>
                                </div>
                              );
                            })
                          ) : (
                            <p className="text-xs text-slate-500">尚无 audit event。</p>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="mt-3 text-xs text-slate-500">
                      当前 Core Workspace：{overview?.currentCoreWorkspaceId ?? "未绑定"}
                    </p>
                  )}
                  {!item.outboundTransport.configured &&
                  (item.stage === "SAFE_TO_SUBMIT" ||
                    item.stage === "OUTCOME_UNKNOWN_RETRY_EXACT_REQUEST") ? (
                    <p className="mt-2 text-xs text-amber-700">
                      Outbound blocked: {item.outboundTransport.issueCode ?? "not configured"}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {item.stage === "NOT_PREPARED" ? (
                    <button
                      type="button"
                      onClick={() => void action(item.readyPackage.id, "PREPARE")}
                      disabled={!canPrepare || loading || acting !== null}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                    >
                      <Snowflake size={15} aria-hidden="true" />
                      {preparing ? "冻结中…" : "冻结 V2 Delivery"}
                    </button>
                  ) : null}

                  {showSubmit ? (
                    <button
                      type="button"
                      onClick={() => void action(item.readyPackage.id, "SUBMIT")}
                      disabled={!canSubmit || loading || acting !== null}
                      className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                    >
                      {submitting ? "处理中…" : submitLabel}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
