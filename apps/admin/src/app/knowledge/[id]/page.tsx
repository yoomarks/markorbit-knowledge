import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import { AdminShell } from "@/components/admin-shell";
import { ContentLocalGraph } from "@/components/knowledge/content-local-graph";
import { ContentReader } from "@/components/knowledge/content-reader";
import { ContentRelationshipPanel } from "@/components/knowledge/content-relationship-panel";
import { EvidenceChangeReview } from "@/components/knowledge/evidence-change-review";
import { EvidenceInspector } from "@/components/knowledge/evidence-inspector";

export const dynamic = "force-dynamic";

export default async function KnowledgeContentReaderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminShell>
      <div className="space-y-5">
        <EvidenceInspector />
        <ContentReader documentId={id} workspaceId={DEFAULT_WORKSPACE.id} />
        <EvidenceChangeReview documentId={id} workspaceId={DEFAULT_WORKSPACE.id} />
        <section id="inspector-relations" className="space-y-5 scroll-mt-5">
          <ContentRelationshipPanel documentId={id} workspaceId={DEFAULT_WORKSPACE.id} />
          <div id="knowledge-graph">
            <ContentLocalGraph documentId={id} workspaceId={DEFAULT_WORKSPACE.id} />
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
