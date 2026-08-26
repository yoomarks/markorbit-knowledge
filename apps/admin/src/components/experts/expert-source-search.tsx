"use client";

import { useState } from "react";
import type { ExpertSourceRetrievalResultV1 } from "@markorbit/contracts";

type ApiError = { error?: { message?: string } };

type ExpertSourceSearchProps = {
  workspaceId: string;
};

const PAGE_SIZE = 20;

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | ApiError;
  if (!response.ok) {
    const error = body as ApiError;
    throw new Error(error.error?.message ?? `Request failed with HTTP ${response.status}`);
  }
  return body as T;
}

export function ExpertSourceSearch({ workspaceId }: ExpertSourceSearchProps) {
  const [jurisdiction, setJurisdiction] = useState("");
  const [topic, setTopic] = useState("");
  const [expertRef, setExpertRef] = useState("");
  const [organizationRef, setOrganizationRef] = useState("");
  const [relatedSourceRef, setRelatedSourceRef] = useState("");
  const [relatedCaseRef, setRelatedCaseRef] = useState("");
  const [receivedFrom, setReceivedFrom] = useState("");
  const [receivedTo, setReceivedTo] = useState("");
  const [result, setResult] = useState<ExpertSourceRetrievalResultV1 | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(offset = 0) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (jurisdiction.trim()) params.set("jurisdiction", jurisdiction.trim());
      if (topic.trim()) params.set("topic", topic.trim());
      if (expertRef.trim()) params.set("expertRef", expertRef.trim());
      if (organizationRef.trim()) params.set("organizationRef", organizationRef.trim());
      if (relatedSourceRef.trim()) params.set("relatedSourceRef", relatedSourceRef.trim());
      if (relatedCaseRef.trim()) params.set("relatedCaseRef", relatedCaseRef.trim());
      if (receivedFrom) params.set("receivedFrom", `${receivedFrom}T00:00:00.000Z`);
      if (receivedTo) params.set("receivedTo", `${receivedTo}T23:59:59.999Z`);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));

      const response = await fetch(`/api/expert-sources?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
        headers: { "x-markorbit-workspace-id": workspaceId },
      });
      setResult(await responseJson<ExpertSourceRetrievalResultV1>(response));
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Expert source search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">
            专家来源检索 · Expert Source Retrieval
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            按司法辖区、主题、专家/机构、日期和关联来源/案件筛选已捕获的 Expert Source。
            返回值保留原始证据引用与 provenance，不提供专家评分、真伪评分或推荐。
          </p>
        </div>
        {result ? (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {result.total} records
          </span>
        ) : null}
      </div>

      <form
        className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch(0);
        }}
      >
        <input
          value={jurisdiction}
          onChange={(event) => setJurisdiction(event.target.value)}
          placeholder="Jurisdiction，例如 US"
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400"
        />
        <input
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          placeholder="Topic"
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400"
        />
        <input
          value={expertRef}
          onChange={(event) => setExpertRef(event.target.value)}
          placeholder="Expert ref"
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400"
        />
        <input
          value={organizationRef}
          onChange={(event) => setOrganizationRef(event.target.value)}
          placeholder="Organization ref"
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400"
        />
        <input
          value={relatedSourceRef}
          onChange={(event) => setRelatedSourceRef(event.target.value)}
          placeholder="Related source ref"
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400"
        />
        <input
          value={relatedCaseRef}
          onChange={(event) => setRelatedCaseRef(event.target.value)}
          placeholder="Related case ref"
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400"
        />
        <label className="grid gap-1 text-xs text-slate-500">
          Received from
          <input
            type="date"
            value={receivedFrom}
            onChange={(event) => setReceivedFrom(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-400"
          />
        </label>
        <label className="grid gap-1 text-xs text-slate-500">
          Received to
          <input
            type="date"
            value={receivedTo}
            onChange={(event) => setReceivedTo(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-400"
          />
        </label>
        <div className="md:col-span-2 xl:col-span-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => {
              setJurisdiction("");
              setTopic("");
              setExpertRef("");
              setOrganizationRef("");
              setRelatedSourceRef("");
              setRelatedCaseRef("");
              setReceivedFrom("");
              setReceivedTo("");
              setResult(null);
              setError(null);
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            清空筛选
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Searching…" : "检索 Expert Sources"}
          </button>
        </div>
      </form>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mt-5 space-y-3 border-t border-slate-100 pt-5">
          {result.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              当前筛选条件下没有 Expert Source Record。
            </div>
          ) : null}
          {result.items.map((record) => (
            <article key={record.sourceRecordId} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700">
                      {record.jurisdiction}
                    </span>
                    <span>{record.topic}</span>
                    <span>·</span>
                    <span>{new Date(record.receivedAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-900">{record.expertRef}</p>
                  {record.organizationRef ? (
                    <p className="mt-1 text-xs text-slate-500">{record.organizationRef}</p>
                  ) : null}
                </div>
                <code className="max-w-full truncate rounded-lg bg-slate-50 px-2 py-1 text-[10px] text-slate-500">
                  {record.sourceRecordId}
                </code>
              </div>

              <div className="mt-4 grid gap-3 text-xs text-slate-600 md:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="font-medium text-slate-800">Raw evidence</p>
                  <p className="mt-1 break-all">{record.rawAnswerArtifactRefs.join(", ")}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="font-medium text-slate-800">Communication</p>
                  <p className="mt-1 break-all">
                    Thread: {record.communication.communicationThreadRef}
                  </p>
                  <p className="mt-1 break-all">
                    Messages: {record.communication.messageRefs.join(", ")}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="font-medium text-slate-800">Attachments / related refs</p>
                  <p className="mt-1 break-all">
                    Attachments:{" "}
                    {record.attachmentRefs.length ? record.attachmentRefs.join(", ") : "None"}
                  </p>
                  <p className="mt-1 break-all">
                    Sources:{" "}
                    {record.relatedSourceRefs.length ? record.relatedSourceRefs.join(", ") : "None"}
                  </p>
                  <p className="mt-1 break-all">
                    Cases:{" "}
                    {record.relatedCaseRefs.length ? record.relatedCaseRefs.join(", ") : "None"}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="font-medium text-slate-800">Provenance</p>
                  <p className="mt-1">Source family: {record.provenance.sourceFamily}</p>
                  <p className="mt-1">Original evidence authoritative: yes</p>
                  <p className="mt-1">Normalized derivative is original evidence: no</p>
                  <p className="mt-1">Access: {record.accessClassification}</p>
                </div>
              </div>
            </article>
          ))}

          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <button
              type="button"
              disabled={loading || result.offset === 0}
              onClick={() => void runSearch(Math.max(0, result.offset - result.limit))}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 disabled:opacity-40"
            >
              上一页
            </button>
            <span className="text-xs text-slate-500">
              {result.total === 0 ? 0 : result.offset + 1}–
              {Math.min(result.offset + result.items.length, result.total)} / {result.total}
            </span>
            <button
              type="button"
              disabled={loading || result.offset + result.items.length >= result.total}
              onClick={() => void runSearch(result.offset + result.limit)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
