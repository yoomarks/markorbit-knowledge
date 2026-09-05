"use client";

import Link from "next/link";
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

export function KnowledgeReaderSurface({ documentId }: { documentId: string }) {
  const { workspaceId } = useKnowledgeWorkspace();
  return (
    <div className="space-y-5">
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
