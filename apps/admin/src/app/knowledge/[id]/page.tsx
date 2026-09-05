import { AdminShell } from "@/components/admin-shell";
import { KnowledgeWorkspaceBoundary } from "@/components/knowledge/knowledge-workspace";
import { KnowledgeReaderSurface } from "@/components/knowledge/knowledge-workspace-surfaces";

export const dynamic = "force-dynamic";

export default async function KnowledgeContentReaderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminShell>
      <KnowledgeWorkspaceBoundary>
        <KnowledgeReaderSurface documentId={id} />
      </KnowledgeWorkspaceBoundary>
    </AdminShell>
  );
}
