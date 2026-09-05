"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { resolveKnowledgeReturnHref } from "@/lib/knowledge-navigation-model";
import { knowledgeWorkspaceHref } from "@/lib/knowledge-workspace-model";
import { ContentLocalGraph } from "./content-local-graph";
import { ContentReader } from "./content-reader";
import { ContentRelationshipPanel } from "./content-relationship-panel";
import { EvidenceChangeReview } from "./evidence-change-review";
import { EvidenceInspector } from "./evidence-inspector";
import { KnowledgeBrowser } from "./knowledge-browser";
import { KnowledgeHybridSearch } from "./knowledge-hybrid-search";
import { useKnowledgeWorkspace } from "./knowledge-workspace";

export function KnowledgeSearchEntryLink() {
  const { workspaceId } = useKnowledgeWorkspace();
  return (
    <Link
      href={knowledgeWorkspaceHref("/knowledge/search", workspaceId)}
      className="inline-flex items-center rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-800"
    >
      混合搜索 / Hybrid Search
    </Link>
  );
}

export function KnowledgeBrowseSurface() {
  const { workspaceId } = useKnowledgeWorkspace();
  return <KnowledgeBrowser workspaceId={workspaceId} />;
}

export function KnowledgeSearchSurface() {
  const { workspaceId } = useKnowledgeWorkspace();
  return <KnowledgeHybridSearch workspaceId={workspaceId} />;
}

function EvidenceWorkspaceReturn({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const fallback = knowledgeWorkspaceHref("/knowledge", workspaceId);
  const resolvedReturn = resolveKnowledgeReturnHref(returnTo, workspaceId);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {returnTo ? (
        <Link
          href={resolvedReturn}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft size={16} /> 返回工作上下文 / Back to work context
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft size={16} /> 返回上一页 / Back
        </button>
      )}
      <Link
        href={fallback}
        className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
      >
        Knowledge Home
      </Link>
    </div>
  );
}

export function KnowledgeReaderSurface({ documentId }: { documentId: string }) {
  const { workspaceId } = useKnowledgeWorkspace();
  return (
    <div className="space-y-5">
      <EvidenceWorkspaceReturn workspaceId={workspaceId} />
      <EvidenceInspector />
      <ContentReader documentId={documentId} workspaceId={workspaceId} />
      <EvidenceChangeReview documentId={documentId} workspaceId={workspaceId} />
      <section id="inspector-relations" className="space-y-5 scroll-mt-5">
        <ContentRelationshipPanel documentId={documentId} workspaceId={workspaceId} />
        <div id="knowledge-graph">
          <ContentLocalGraph documentId={documentId} workspaceId={workspaceId} />
        </div>
      </section>
    </div>
  );
}
