import { AdminShell } from "@/components/admin-shell";
import { SourceAssessmentPanel } from "@/components/sources/source-assessment-panel";
import { SourceDetailWorkbench } from "@/components/sources/source-detail-workbench";
import { SourceRelatedRecommendations } from "@/components/sources/source-related-recommendations";

export const dynamic = "force-dynamic";

export default async function SourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminShell>
      <div className="space-y-5">
        <SourceDetailWorkbench sourceId={id} />
        <SourceAssessmentPanel sourceId={id} />
        <SourceRelatedRecommendations sourceId={id} />
      </div>
    </AdminShell>
  );
}
