import { Suspense } from "react";
import { AdminShell } from "@/components/admin-shell";
import { KnowledgeWorkspaceBoundary } from "@/components/knowledge/knowledge-workspace";
import { EvidenceSetListSurface } from "@/components/knowledge/knowledge-workspace-surfaces";

export const dynamic = "force-dynamic";

export default function EvidenceSetsPage() {
  return (
    <AdminShell>
      <Suspense fallback={null}>
        <KnowledgeWorkspaceBoundary>
          <EvidenceSetListSurface />
        </KnowledgeWorkspaceBoundary>
      </Suspense>
    </AdminShell>
  );
}
