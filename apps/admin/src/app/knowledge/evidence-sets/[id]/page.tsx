import { Suspense } from "react";
import { AdminShell } from "@/components/admin-shell";
import { KnowledgeWorkspaceBoundary } from "@/components/knowledge/knowledge-workspace";
import { EvidenceSetReviewSurface } from "@/components/knowledge/knowledge-workspace-surfaces";

export const dynamic = "force-dynamic";

export default async function EvidenceSetReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminShell>
      <Suspense fallback={null}>
        <KnowledgeWorkspaceBoundary>
          <EvidenceSetReviewSurface evidenceSetId={id} />
        </KnowledgeWorkspaceBoundary>
      </Suspense>
    </AdminShell>
  );
}
