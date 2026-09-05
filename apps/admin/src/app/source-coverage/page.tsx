import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { PageHeading } from "@/components/page-heading";
import { SourceCoverageBoardWorkspace } from "@/components/source-coverage/source-coverage-board";

export const dynamic = "force-dynamic";

export default function SourceCoveragePage() {
  return (
    <AdminShell>
      <PageHeading
        title="Source Coverage Board / 来源覆盖板"
        description="按辖区、官方机构、source family 与真实来源核对 evidence-supply 边界、最后成功采集、检查、客观变化和运行健康。COMPLETE 仅代表可验证的供应路径，不构成法律或语义完整性意见。"
        actions={
          <Link
            href="/sources"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            返回 Sources
          </Link>
        }
      />
      <Suspense fallback={null}>
        <SourceCoverageBoardWorkspace />
      </Suspense>
    </AdminShell>
  );
}
