"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Loader2, Network } from "lucide-react";
import { useAdminI18n } from "@/lib/i18n";

type GraphNode = {
  ref: string;
  distance: 0 | 1 | 2;
  content: {
    objectId: string;
    objectKind: string;
    workspaceId: string;
  };
  title?: string;
  readerHref?: string;
  sourceName?: string;
  version?: number;
  jurisdictions: string[];
};

type GraphEdge = {
  key: string;
  fromRef: string;
  toRef: string;
  relationType: string;
  origin: string;
  evidenceRef?: string;
  algorithm?: { id: string; version: string };
};

type GraphResponse = {
  protocolVersion: "1.0";
  rootRef: string;
  depth: 1 | 2;
  nodes: GraphNode[];
  edges: GraphEdge[];
  expandedNodeCount: number;
  truncated: boolean;
  truncationReasons: Array<"NEIGHBOR_PAGE_LIMIT" | "NODE_BUDGET" | "EDGE_BUDGET">;
  limits: { maxNodes: number; maxEdges: number; neighborPageLimit: number };
};

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

function NodeCard({ node, root = false }: { node: GraphNode; root?: boolean }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold text-slate-900">
          {node.title ?? node.content.objectId}
        </p>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
          {root ? "ROOT" : `${node.distance}-HOP`}
        </span>
      </div>
      <p className="mt-1 truncate font-mono text-[10px] text-slate-400">{node.ref}</p>
      <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-slate-500">
        {node.sourceName ? <span>{node.sourceName}</span> : null}
        {node.jurisdictions.length ? <span>{node.jurisdictions.join(", ")}</span> : null}
        {node.version === undefined ? null : <span>v{node.version}</span>}
      </div>
    </>
  );

  const className = root
    ? "block rounded-xl border border-emerald-300 bg-emerald-50/70 p-3"
    : "block rounded-xl border border-slate-200 bg-white p-3 transition hover:border-emerald-300 hover:shadow-sm";

  return node.readerHref ? (
    <Link href={node.readerHref} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function EdgeRow({ edge }: { edge: GraphEdge }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
        <span className="max-w-[14rem] truncate font-mono text-[10px] text-slate-500">
          {edge.fromRef}
        </span>
        <ArrowRight size={12} className="text-slate-400" />
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
          {edge.relationType}
        </span>
        <ArrowRight size={12} className="text-slate-400" />
        <span className="max-w-[14rem] truncate font-mono text-[10px] text-slate-500">
          {edge.toRef}
        </span>
      </div>
      <p className="mt-1.5 break-all text-[10px] leading-4 text-slate-400">
        {edge.origin}
        {edge.algorithm ? ` · ${edge.algorithm.id}@${edge.algorithm.version}` : ""}
        {edge.evidenceRef ? ` · evidence: ${edge.evidenceRef}` : ""}
      </p>
    </div>
  );
}

export function ContentLocalGraph({
  documentId,
  workspaceId,
}: {
  documentId: string;
  workspaceId: string;
}) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const [depth, setDepth] = useState<1 | 2>(2);
  const [data, setData] = useState<GraphResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/knowledge/${encodeURIComponent(documentId)}/graph?workspaceId=${encodeURIComponent(workspaceId)}&depth=${depth}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error(await readError(response));
        const value = (await response.json()) as GraphResponse;
        if (active) {
          setData(value);
          setError(null);
        }
      } catch (requestError) {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : zh
                ? "无法读取局部关系图"
                : "Unable to load local graph",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [depth, documentId, workspaceId, zh]);

  const root = useMemo(() => data?.nodes.find((node) => node.distance === 0), [data]);
  const firstHop = useMemo(() => data?.nodes.filter((node) => node.distance === 1) ?? [], [data]);
  const secondHop = useMemo(() => data?.nodes.filter((node) => node.distance === 2) ?? [], [data]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Network size={18} className="text-emerald-700" />
            <h2 className="text-base font-semibold text-slate-950">
              {zh ? "局部内容关系图" : "Local Content Graph"}
            </h2>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            {zh
              ? "仅围绕当前内容展开 1–2 跳内容关系，用于导航与来源核查；不进行实体解析、业务相关性评分或推荐。"
              : "A bounded 1–2 hop content neighborhood for navigation and provenance inspection only; no entity resolution, business relevance scoring, or recommendation."}
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          {([1, 2] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDepth(value)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                depth === value
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {value} {zh ? "跳" : value === 1 ? "hop" : "hops"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={15} className="animate-spin" />
          {zh ? "正在展开局部关系…" : "Expanding local neighborhood…"}
        </div>
      ) : error ? (
        <p className="mt-5 text-sm text-rose-700">{error}</p>
      ) : data && root ? (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-slate-100 py-3 text-xs text-slate-500">
            <span>
              {data.nodes.length} {zh ? "个节点" : "nodes"} · {data.edges.length}{" "}
              {zh ? "条关系" : "links"} · {data.expandedNodeCount}{" "}
              {zh ? "个已展开节点" : "expanded nodes"}
            </span>
            {data.truncated ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-800">
                {zh ? "局部图已按预算截断" : "Graph truncated by budget"}
              </span>
            ) : null}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                {zh ? "当前内容" : "Root"}
              </p>
              <NodeCard node={root} root />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  1-hop
                </p>
                <span className="text-[10px] text-slate-400">{firstHop.length}</span>
              </div>
              <div className="space-y-2">
                {firstHop.length ? (
                  firstHop.map((node) => <NodeCard key={node.ref} node={node} />)
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                    {zh ? "暂无一跳内容关系。" : "No first-hop content relationships."}
                  </p>
                )}
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  2-hop
                </p>
                <span className="text-[10px] text-slate-400">{secondHop.length}</span>
              </div>
              <div className="space-y-2">
                {depth === 1 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                    {zh
                      ? "切换到 2 跳以展开第二层。"
                      : "Switch to 2 hops to expand the second layer."}
                  </p>
                ) : secondHop.length ? (
                  secondHop.map((node) => <NodeCard key={node.ref} node={node} />)
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                    {zh ? "暂无第二跳内容关系。" : "No second-hop content relationships."}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                {zh ? "关系与来源" : "Edges & provenance"}
              </h3>
              <span className="text-[10px] text-slate-400">
                {zh ? "方向保持原始关系" : "Original direction preserved"}
              </span>
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {data.edges.length ? (
                data.edges.map((edge) => <EdgeRow key={edge.key} edge={edge} />)
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500 lg:col-span-2">
                  {zh ? "当前内容尚无可展示关系。" : "No local content edges are available yet."}
                </p>
              )}
            </div>
          </div>

          {data.truncated ? (
            <p className="mt-4 text-[10px] leading-4 text-amber-700">
              {zh ? "截断原因" : "Truncation"}: {data.truncationReasons.join(", ")} · max{" "}
              {data.limits.maxNodes} nodes / {data.limits.maxEdges} edges /{" "}
              {data.limits.neighborPageLimit} per neighborhood
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
