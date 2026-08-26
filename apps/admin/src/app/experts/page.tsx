import { AdminShell } from "@/components/admin-shell";
import { ExpertAdminWorkspace } from "@/components/experts/expert-admin-workspace";

export default function ExpertsPage() {
  return (
    <AdminShell>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">
          Expert Knowledge
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
          专家问答工作台 · Expert Q&amp;A
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          管理需要向专业人士确认的问题、回复证据与后续追问。Knowledge
          只保存信息与来源证据；专家评分、真伪裁决、推荐和策略判断不属于此工作台。
        </p>
      </div>

      <ExpertAdminWorkspace />
    </AdminShell>
  );
}
