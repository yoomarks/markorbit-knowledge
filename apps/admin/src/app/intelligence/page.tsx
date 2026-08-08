import { AdminShell } from "@/components/admin-shell";
import { PageHeading } from "@/components/page-heading";
import { SourceIntelligenceWorkbench } from "@/components/sources/source-intelligence-workbench";

export const dynamic = "force-dynamic";

export default function SourceIntelligencePage() {
  return (
    <AdminShell>
      <PageHeading
        title="Source Intelligence"
        description="比较来源的运营价值、证据基础与复查建议；保持运营优先级、法律权威和执行权限彼此独立。"
      />
      <SourceIntelligenceWorkbench />
    </AdminShell>
  );
}
