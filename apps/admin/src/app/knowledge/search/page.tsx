import { AdminShell } from "@/components/admin-shell";
import { KnowledgeWorkspaceBoundary } from "@/components/knowledge/knowledge-workspace";
import { KnowledgeSearchSurface } from "@/components/knowledge/knowledge-workspace-surfaces";

export const dynamic = "force-dynamic";

export default function KnowledgeHybridSearchPage() {
  return (
    <AdminShell>
      <KnowledgeWorkspaceBoundary>
        <KnowledgeSearchSurface />
      </KnowledgeWorkspaceBoundary>
    </AdminShell>
  );
}
