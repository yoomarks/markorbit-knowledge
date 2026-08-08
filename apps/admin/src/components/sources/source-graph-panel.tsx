"use client";

import { useEffect, useMemo, useState } from "react";
import { Network, RefreshCw } from "lucide-react";
import type {
  SourceDefinition,
  SourceGraphEdge,
  SourceGraphNode,
  WebsiteSourceProfile,
} from "@markorbit/contracts";

type GraphSnapshot = {
  profile: WebsiteSourceProfile;
  nodes: SourceGraphNode[];
  edges: SourceGraphEdge[];
  summary: {
    nodeCount: number;
    edgeCount: number;
    nodeKinds: Record<string, number>;
    reviewStates: Record<string, number>;
    lifecycleStates: Record<string, number>;
  };
};

type CompatibleGraph = {
  requestedSourceId: string;
  governedSourceId: string;
  compatibilityProjection: boolean;
  snapshot: GraphSnapshot;
};

type GraphResponse = {
  sourceId: string;
  graph: CompatibleGraph | null;
  error?: { message?: string };
};

function nodeLabel(node: SourceGraphNode): string {
  if (node.kind === "WEBSITE") return node.displayName ?? node.host;
  if (node.kind === "SECTION") return node.label;
  if (node.kind === "ORGANIZATION" || node.kind === "PERSON") return node.displayName;
  if (node.kind === "CONTACT_POINT") return node.value;
  return node.title ?? node.canonicalUri;
}

function nodeLocator(node: SourceGraphNode): string {
  if (node.kind === "WEBSITE") return node.canonicalOrigin;
  if (node.kind === "SECTION") return node.canonicalUri ?? node.pathPrefix ?? "—";
  if (node.kind === "ORGANIZATION") return node.websiteUri ?? "Source-local observation";
  if (node.kind === "PERSON") return node.roleLabel ?? "Source-local observation";
  if (node.kind === "CONTACT_POINT") return node.contactKind;
  return node.canonicalUri;
}

export function SourceGraphPanel({ sourceId }: { sourceId: string }) {
  const [source, setSource] = useState<SourceDefinition | null>(null);
  const [graph, setGraph] = useState<CompatibleGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [projecting, setProjecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(signal?: AbortSignal) {
    setError(null);
    const [sourceResponse, graphResponse] = await Promise.all([
      fetch(`/api/sources/${sourceId}`, { signal }),
      fetch(`/api/sources/${sourceId}/graph`, { signal }),
    ]);
    const sourceBody = (await sourceResponse.json()) as {
      source?: SourceDefinition;
      error?: { message?: string };
    };
    const graphBody = (await graphResponse.json()) as GraphResponse;
    if (!sourceResponse.ok || !sourceBody.source) {
      throw new Error(sourceBody.error?.message ?? "Unable to load source");
    }
    if (!graphResponse.ok) {
      throw new Error(graphBody.error?.message ?? "Unable to load Source Map");
    }
    setSource(sourceBody.source);
    setGraph(graphBody.graph);
  }

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(
          requestError instanceof Error ? requestError.message : "Unable to load Source Map",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [sourceId]);

  async function projectLegacySource() {
    setProjecting(true);
    setError(null);
    try {
      const response = await fetch(`/api/sources/${sourceId}/graph`, { method: "POST" });
      const body = (await response.json()) as GraphResponse;
      if (!response.ok || !body.graph) {
        throw new Error(body.error?.message ?? "Unable to project Source Map");
      }
      setGraph(body.graph);
    } catch (projectionError) {
      setError(
        projectionError instanceof Error ? projectionError.message : "Unable to project Source Map",
      );
    } finally {
      setProjecting(false);
    }
  }

  const visibleNodes = useMemo(
    () =>
      graph?.snapshot.nodes
        .slice()
        .sort((a, b) => b.lastObservedAt.localeCompare(a.lastObservedAt)) ?? [],
    [graph],
  );

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        正在读取 Source Map…
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Network size={18} className="text-emerald-700" aria-hidden="true" />
            <h2 className="font-semibold text-slate-950">Source Map</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            网站级 Source 下的页面、文档、站点地图与来源内实体关系。这里保存的是可追溯观察证据，
            RETAINED 不等于法律事实、专业质量或身份已经验证。
          </p>
        </div>
        {source?.sourceType === "WEB" && !graph ? (
          <button
            type="button"
            onClick={projectLegacySource}
            disabled={projecting}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            <RefreshCw size={16} aria-hidden="true" />
            {projecting ? "建立中…" : "建立兼容 Source Map"}
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {!graph ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center">
          <Network className="mx-auto text-slate-400" size={30} aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-slate-800">尚未建立网站级 Source Map</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            新 Discovery Source 会自动写入 Source Graph；旧 WEB Source 可进行非破坏性兼容投影。
          </p>
        </div>
      ) : (
        <>
          {graph.compatibilityProjection ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              当前旧 Source 通过相同网站 Origin 映射到治理 Source：
              <span className="ml-1 font-mono text-xs">{graph.governedSourceId}</span>。旧
              SourceDefinition 未被删除或改写。
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Website</div>
              <div className="mt-2 truncate text-sm font-semibold text-slate-950">
                {graph.snapshot.profile.canonicalHost}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Nodes</div>
              <div className="mt-2 text-2xl font-semibold text-slate-950">
                {graph.snapshot.summary.nodeCount}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Edges</div>
              <div className="mt-2 text-2xl font-semibold text-slate-950">
                {graph.snapshot.summary.edgeCount}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Profile</div>
              <div className="mt-2 truncate font-mono text-xs text-slate-700">
                {graph.snapshot.profile.id}
              </div>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">类型</th>
                  <th className="px-4 py-3 font-medium">节点</th>
                  <th className="px-4 py-3 font-medium">Locator / Role</th>
                  <th className="px-4 py-3 font-medium">Review</th>
                  <th className="px-4 py-3 font-medium">Lifecycle</th>
                  <th className="px-4 py-3 font-medium">Last observed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleNodes.map((node) => (
                  <tr key={node.id}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{node.kind}</td>
                    <td className="max-w-[260px] px-4 py-3 font-medium text-slate-900">
                      <div className="truncate" title={nodeLabel(node)}>
                        {nodeLabel(node)}
                      </div>
                    </td>
                    <td className="max-w-[340px] px-4 py-3 text-xs text-slate-600">
                      <div className="truncate" title={nodeLocator(node)}>
                        {nodeLocator(node)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{node.reviewState}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{node.lifecycleState}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{node.lastObservedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
