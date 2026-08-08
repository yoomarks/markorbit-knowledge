import { AdminShell } from "@/components/admin-shell";
import { PageHeading } from "@/components/page-heading";
import { SourceIntelligenceWorkbench } from "@/components/sources/source-intelligence-workbench";

export const dynamic = "force-dynamic";

export default function SourceIntelligencePage() {
  return (
    <AdminShell>
      <PageHeading
        title="Source Intelligence"
        description="默认以 Source Value × Evidence Maturity 双轴比较来源；Acquisition Cost 独立展示，legacy v1 Tier 仅保留在 Advanced compatibility。"
      />
      <SourceIntelligenceWorkbench />
    </AdminShell>
  );
}
