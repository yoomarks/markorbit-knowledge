import { AdminShell } from "@/components/admin-shell";
import { ArtifactDetail } from "@/components/artifacts/artifact-detail";
import { PageHeading } from "@/components/page-heading";

export const dynamic = "force-dynamic";

export default async function ArtifactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminShell>
      <PageHeading
        title="RawArtifact 详情"
        description="查看不可变文件身份、完整 Provenance、内容对象复用和安全下载边界。"
      />
      <ArtifactDetail artifactId={id} />
    </AdminShell>
  );
}
