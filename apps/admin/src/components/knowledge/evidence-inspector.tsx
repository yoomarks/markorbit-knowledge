export const EVIDENCE_INSPECTOR_SECTIONS = [
  { id: "inspector-content", label: "Content" },
  { id: "evidence-change-review", label: "Changes" },
  { id: "inspector-provenance", label: "Provenance" },
  { id: "inspector-relations", label: "Relations" },
  { id: "inspector-history", label: "History" },
] as const;

export function EvidenceInspector() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            Knowledge · Evidence Inspector V2
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            Evidence Inspector
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Inspect document content, immutable evidence lineage, objective changes, relations and
            durable history in one workspace. This surface does not assess legal significance or
            recommend action.
          </p>
        </div>
        <nav aria-label="Evidence Inspector sections" className="flex flex-wrap gap-2">
          {EVIDENCE_INSPECTOR_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-950"
            >
              {section.label}
            </a>
          ))}
        </nav>
      </div>
    </section>
  );
}
