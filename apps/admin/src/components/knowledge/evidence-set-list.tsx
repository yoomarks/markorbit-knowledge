"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Archive, Loader2 } from "lucide-react";
import type { EvidenceSetV1 } from "@markorbit/contracts";
import { useAdminI18n } from "@/lib/i18n";
import { knowledgeWorkspaceHref } from "@/lib/knowledge-workspace-model";

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export function EvidenceSetList({ workspaceId }: { workspaceId: string }) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const [items, setItems] = useState<EvidenceSetV1[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const params = new URLSearchParams({ workspaceId });
        const response = await fetch(`/api/evidence-sets?${params}`, { cache: "no-store" });
        if (!response.ok) throw new Error(await readError(response));
        const body = (await response.json()) as { items: EvidenceSetV1[] };
        if (active) {
          setItems(body.items);
          setError(null);
        }
      } catch (requestError) {
        if (active) {
          setError(
            requestError instanceof Error ? requestError.message : "Unable to load Evidence Sets",
          );
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [workspaceId]);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
            <Archive size={18} />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-slate-950">
              {zh ? "Evidence Sets / Review Packages" : "Evidence Sets / Review Packages"}
            </h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              {zh
                ? "这里保存人工显式冻结的证据上下文。每个集合固定精确版本与摘要，Review Package 只展示事实来源与版本变化。"
                : "These are operator-frozen evidence contexts. Each set fixes exact versions and digests; Review Packages show factual provenance and version drift only."}
            </p>
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
          {error}
        </section>
      ) : items === null ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          <Loader2 className="mx-auto mb-3 animate-spin" size={20} />
          {zh ? "正在读取 Evidence Sets…" : "Loading Evidence Sets…"}
        </section>
      ) : items.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
          <Archive className="mx-auto text-slate-300" size={30} />
          <p className="mt-3 text-sm font-semibold text-slate-700">
            {zh ? "还没有冻结的 Evidence Set" : "No frozen Evidence Sets yet"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {zh
              ? "在 Knowledge Browser 或 Search 中显式选择证据后创建。"
              : "Select evidence explicitly in Knowledge Browser or Search to create one."}
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="divide-y divide-slate-100">
            {items.map((item) => {
              const sourceCount = new Set(item.members.map((member) => member.sourceId)).size;
              const jurisdictions = new Set(item.members.flatMap((member) => member.jurisdictions));
              return (
                <article key={item.evidenceSetId} className="p-5 sm:p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <h2 className="font-semibold text-slate-950">{item.title}</h2>
                      <p className="mt-1 break-all font-mono text-[10px] text-slate-400">
                        {item.evidenceSetId} · r{item.revision} · {item.digest}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                        <span>
                          {item.members.length} {zh ? "项证据" : "members"}
                        </span>
                        <span>
                          · {sourceCount} {zh ? "个来源" : "sources"}
                        </span>
                        <span>
                          · {jurisdictions.size} {zh ? "个地区" : "jurisdictions"}
                        </span>
                        <span>· {new Date(item.createdAt).toLocaleString(locale)}</span>
                      </div>
                    </div>
                    <Link
                      href={knowledgeWorkspaceHref(
                        `/knowledge/evidence-sets/${encodeURIComponent(item.evidenceSetId)}`,
                        workspaceId,
                      )}
                      className="inline-flex shrink-0 items-center rounded-xl bg-slate-950 px-3.5 py-2 text-xs font-semibold text-white"
                    >
                      {zh ? "打开 Review Package" : "Open Review Package"}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
