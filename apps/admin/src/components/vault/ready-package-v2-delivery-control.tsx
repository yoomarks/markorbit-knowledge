"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Send, ShieldAlert, Snowflake } from "lucide-react";
import type { ReadyPackageV2 } from "@markorbit/contracts";

type DeliveryStage =
  | "NOT_PREPARED"
  | "PREPARED"
  | "OUTCOME_UNKNOWN"
  | "FINALIZATION_PENDING"
  | "DELIVERED";

type ResultEvidence = {
  status: "RECEIVED" | "ACCEPTED" | "REJECTED";
  recordedAt: string;
  requestSha256: string;
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
  submission: Submission | null;
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

function stageLabel(stage: DeliveryStage): string {
  if (stage === "NOT_PREPARED") return "未冻结";
  if (stage === "PREPARED") return "已冻结 · 未发送";
  if (stage === "OUTCOME_UNKNOWN") return "结果未知 · 可原样重试";
  if (stage === "FINALIZATION_PENDING") return "Transport 已落盘 · 待本地收敛";
  return "Delivery 已记录";
}

async function loadOverview(workspaceId: string): Promise<Overview> {
  const response = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/ready-package-v2-deliveries`,
  );
  const body = (await response.json()) as Overview | ApiError;
  if (!response.ok) throw new Error(readError(body, "Unable to load V2 delivery state"));
  return body as Overview;
}

export function ReadyPackageV2DeliveryControl({ workspaceId }: { workspaceId: string }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          headers: { "content-type": "application/json" },
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

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-950">
            <Send size={19} aria-hidden="true" />
            <h2 className="font-semibold">ReadyPackage V2 Delivery</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            K14 将 V2 delivery 分成冻结与提交两个显式动作。冻结时锁定 Core Workspace、完整 Content
            Export V2、提交时间、request SHA-256 与 idempotency identity；之后任何重试都只能发送同一份字节。
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
            V2 绝不会复用现有 V1 Core intake URL。只有独立的 `MARKORBIT_CORE_V2_DELIVERY_URL`、内部密钥和
            `MARKORBIT_CORE_V2_PROTOCOL_VERSION=1.0` 同时明确配置时，提交按钮才允许产生网络请求。K14
            不修改 Core。
          </p>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="mt-6 space-y-3 border-t border-slate-100 pt-5">
        {!overview?.items.length ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
            {loading ? "加载中…" : "尚无 ReadyPackage V2 可进入 delivery foundation。"}
          </div>
        ) : null}

        {overview?.items.map((item) => {
          const submission = item.submission;
          const preparing = acting === `${item.readyPackage.id}:PREPARE`;
          const submitting = acting === `${item.readyPackage.id}:SUBMIT`;
          const canPrepare = item.stage === "NOT_PREPARED" && overview.currentCoreWorkspaceId !== null;
          const canSubmit =
            item.stage === "FINALIZATION_PENDING" ||
            ((item.stage === "PREPARED" || item.stage === "OUTCOME_UNKNOWN") &&
              item.outboundTransport.configured);
          const submitLabel =
            item.stage === "FINALIZATION_PENDING"
              ? "完成本地 Finalization"
              : item.stage === "OUTCOME_UNKNOWN"
                ? "重试同一 V2 请求"
                : "提交冻结的 V2 请求";

          return (
            <div key={item.readyPackage.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="break-all text-sm font-medium text-slate-900">
                    {item.readyPackage.id}
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-600">{stageLabel(item.stage)}</p>
                  <p className="mt-1 font-mono text-[11px] text-slate-500">
                    package digest {shortHash(item.readyPackage.evidence.digest)}
                  </p>
                  {submission ? (
                    <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                      <p className="break-all">delivery {submission.submissionId}</p>
                      <p className="break-all">Core Workspace {submission.coreWorkspaceId}</p>
                      <p>request {shortHash(submission.requestSha256)}</p>
                      <p>content export {shortHash(submission.contentExportSha256)}</p>
                      <p>transport attempts {submission.transportAttempts}</p>
                      <p>
                        result {submission.result?.status ?? submission.transportResult?.status ?? "—"}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-slate-500">
                      当前 Core Workspace：{overview.currentCoreWorkspaceId ?? "未绑定"}
                    </p>
                  )}
                  {!item.outboundTransport.configured && item.stage !== "FINALIZATION_PENDING" ? (
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

                  {item.stage !== "NOT_PREPARED" && item.stage !== "DELIVERED" ? (
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
