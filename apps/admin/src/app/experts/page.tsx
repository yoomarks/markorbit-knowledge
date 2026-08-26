import { AdminShell } from "@/components/admin-shell";

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

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-950">
          Expert operator access is temporarily fail-closed
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
          Expert task and source APIs now require a governed Workspace Principal and durable
          workspace binding. The Admin browser does not yet have a trusted session-to-principal
          bridge, so this page intentionally does not call the protected Expert APIs until that
          identity boundary is implemented.
        </p>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-600">
          Internal service credentials must remain server-side and must not be exposed to browser
          code. Existing Expert data remains preserved; only the unauthenticated browser operator
          surface is disabled.
        </p>
      </section>
    </AdminShell>
  );
}
