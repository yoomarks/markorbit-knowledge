"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ExpertQuestionTaskV1, ExpertSourceRecordV1 } from "@markorbit/contracts";

type OperatorStatus = "DRAFT" | "READY_TO_SEND" | "WAITING" | "REPLIED" | "CAPTURED" | "CLOSED";

type OperatorView = {
  task: ExpertQuestionTaskV1;
  status: OperatorStatus;
  replies: ExpertSourceRecordV1[];
};

type ListResponse = {
  items: OperatorView[];
  communication: { connected: boolean; reason?: string };
};

type ApiError = { error?: { message?: string } };

type ExpertQaWorkbenchProps = {
  workspaceId: string;
  csrfToken: string;
};

const statusLabels: Record<OperatorStatus, string> = {
  DRAFT: "草稿 · Draft",
  READY_TO_SEND: "待发送 · Ready",
  WAITING: "等待回复 · Waiting",
  REPLIED: "已回复 · Replied",
  CAPTURED: "已捕获 · Captured",
  CLOSED: "已关闭 · Closed",
};

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | ApiError;
  if (!response.ok) {
    const error = body as ApiError;
    throw new Error(error.error?.message ?? `Request failed with HTTP ${response.status}`);
  }
  return body as T;
}

export function ExpertQaWorkbench({ workspaceId, csrfToken }: ExpertQaWorkbenchProps) {
  const [data, setData] = useState<ListResponse>({
    items: [],
    communication: { connected: false },
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [expertRef, setExpertRef] = useState("");
  const [organizationRef, setOrganizationRef] = useState("");
  const [question, setQuestion] = useState("");
  const [followUps, setFollowUps] = useState<Record<string, string>>({});

  const workspaceHeaders = useMemo(
    () => ({ "x-markorbit-workspace-id": workspaceId }),
    [workspaceId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/expert-tasks", {
        cache: "no-store",
        credentials: "include",
        headers: workspaceHeaders,
      });
      setData(await responseJson<ListResponse>(response));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load Expert tasks");
    } finally {
      setLoading(false);
    }
  }, [workspaceHeaders]);

  useEffect(() => {
    let active = true;
    void fetch("/api/expert-tasks", {
      cache: "no-store",
      credentials: "include",
      headers: workspaceHeaders,
    })
      .then((response) => responseJson<ListResponse>(response))
      .then((next) => {
        if (!active) return;
        setData(next);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load Expert tasks");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceHeaders]);

  const counts = useMemo(() => {
    const result = { active: 0, waiting: 0, replied: 0, captured: 0 };
    for (const item of data.items) {
      if (item.status !== "CLOSED") result.active += 1;
      if (item.status === "WAITING") result.waiting += 1;
      if (item.status === "REPLIED") result.replied += 1;
      if (item.status === "CAPTURED") result.captured += 1;
    }
    return result;
  }, [data.items]);

  async function createDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await responseJson(
        await fetch("/api/expert-tasks", {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            ...workspaceHeaders,
            "x-markorbit-csrf-token": csrfToken,
          },
          body: JSON.stringify({
            topic,
            jurisdiction,
            expertRef,
            organizationRef,
            question,
          }),
        }),
      );
      setQuestion("");
      await load();
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Failed to create Expert draft",
      );
    }
  }

  async function action(id: string, body: Record<string, string>) {
    setBusyId(id);
    setError(null);
    try {
      await responseJson(
        await fetch(`/api/expert-tasks/${encodeURIComponent(id)}`, {
          method: "PATCH",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            ...workspaceHeaders,
            "x-markorbit-csrf-token": csrfToken,
          },
          body: JSON.stringify(body),
        }),
      );
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Expert action failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["进行中", counts.active],
          ["等待回复", counts.waiting],
          ["待处理回复", counts.replied],
          ["已捕获", counts.captured],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      <section
        className={`rounded-2xl border p-4 ${
          data.communication.connected
            ? "border-emerald-200 bg-emerald-50"
            : "border-amber-200 bg-amber-50"
        }`}
      >
        <p className="text-sm font-semibold text-slate-900">
          Shared Communication: {data.communication.connected ? "Connected" : "Fail-closed"}
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          {data.communication.reason ??
            "Expert questions use the reusable Communication Capability rather than a Knowledge-owned mail transport."}
        </p>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-950">
            新建专家问题 · New Expert Question
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            只记录专家身份、问题与证据关联；不进行专家评分、真伪评分或推荐。
          </p>
        </div>
        <form onSubmit={createDraft} className="grid gap-3 md:grid-cols-2">
          <input
            required
            value={jurisdiction}
            onChange={(event) => setJurisdiction(event.target.value)}
            placeholder="Jurisdiction，例如 US"
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400"
          />
          <input
            required
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="Topic，例如 SECTION_8_DECLARATION"
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400"
          />
          <input
            required
            value={expertRef}
            onChange={(event) => setExpertRef(event.target.value)}
            placeholder="Expert ref"
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400"
          />
          <input
            value={organizationRef}
            onChange={(event) => setOrganizationRef(event.target.value)}
            placeholder="Organization ref（可选）"
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400"
          />
          <textarea
            required
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="写下需要向专业人士确认的客观问题"
            rows={4}
            className="md:col-span-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400"
          />
          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              保存草稿
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-950">问题队列 · Question Queue</h2>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            刷新
          </button>
        </div>

        {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}
        {!loading && data.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            尚无 Expert Question Task。
          </div>
        ) : null}

        {data.items.map(({ task, status, replies }) => (
          <article
            key={task.taskId}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
                    {statusLabels[status]}
                  </span>
                  <span>{task.jurisdiction}</span>
                  <span>·</span>
                  <span>{task.topic}</span>
                </div>
                <p className="mt-3 max-w-4xl text-sm font-medium leading-6 text-slate-950">
                  {task.question}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {task.expertRef}
                  {task.organizationRef ? ` · ${task.organizationRef}` : ""}
                </p>
              </div>
              <code className="max-w-full truncate rounded-lg bg-slate-50 px-2 py-1 text-[10px] text-slate-500">
                {task.taskId}
              </code>
            </div>

            {replies.length > 0 ? (
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                {replies.map((reply) => (
                  <div
                    key={reply.sourceRecordId}
                    className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600"
                  >
                    <p className="font-medium text-slate-800">
                      Reply evidence · {new Date(reply.receivedAt).toLocaleString()}
                    </p>
                    <p className="mt-1">Raw evidence: {reply.rawAnswerArtifactRefs.join(", ")}</p>
                    <p className="mt-1">
                      Attachments:{" "}
                      {reply.attachmentRefs.length ? reply.attachmentRefs.join(", ") : "None"}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              {status === "DRAFT" ? (
                <button
                  type="button"
                  disabled={busyId === task.taskId}
                  onClick={() => void action(task.taskId, { action: "READY" })}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  标记待发送
                </button>
              ) : null}
              {status === "READY_TO_SEND" ? (
                <button
                  type="button"
                  disabled={!data.communication.connected || busyId === task.taskId}
                  onClick={() => void action(task.taskId, { action: "SEND" })}
                  title={data.communication.connected ? "Send" : data.communication.reason}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  通过 Communication 发送
                </button>
              ) : null}
              {status === "REPLIED" ? (
                <>
                  <button
                    type="button"
                    disabled={busyId === task.taskId}
                    onClick={() => void action(task.taskId, { action: "CAPTURE" })}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    捕获为 Expert Source
                  </button>
                  <input
                    value={followUps[task.taskId] ?? ""}
                    onChange={(event) =>
                      setFollowUps((current) => ({ ...current, [task.taskId]: event.target.value }))
                    }
                    placeholder="Follow-up question"
                    className="min-w-64 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs"
                  />
                  <button
                    type="button"
                    disabled={!followUps[task.taskId]?.trim() || busyId === task.taskId}
                    onClick={() =>
                      void action(task.taskId, {
                        action: "FOLLOW_UP",
                        question: followUps[task.taskId] ?? "",
                      })
                    }
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
                  >
                    新建 Follow-up
                  </button>
                </>
              ) : null}
              {status === "CAPTURED" ? (
                <button
                  type="button"
                  disabled={busyId === task.taskId}
                  onClick={() => void action(task.taskId, { action: "CLOSE" })}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                >
                  关闭任务
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
