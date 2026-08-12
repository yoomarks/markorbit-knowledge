import Link from "next/link";
import { ArrowRight, Database, PackageCheck, ServerCog, Workflow } from "lucide-react";
import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import { OperationsReadinessPanel } from "./operations/operations-readiness-panel";
import { PageHeading } from "./page-heading";

const operationalAreas = [
  {
    title: "Sources",
    detail: "Review active and error-state SourceDefinitions before relying on new collection output.",
    href: "/sources",
    icon: Database,
  },
  {
    title: "Collection",
    detail: "Inspect durable CollectionRun and Job state, including retry and dead-letter boundaries.",
    href: "/runs",
    icon: Workflow,
  },
  {
    title: "Workers",
    detail: "Check heartbeat freshness, runtime health, capacity, and active lease evidence.",
    href: "/workers",
    icon: ServerCog,
  },
  {
    title: "Ready Packages",
    detail: "Resolve V2 delivery actions without bypassing frozen-request or reconciliation rules.",
    href: "/packages",
    icon: PackageCheck,
  },
] as const;

export function DashboardPage() {
  return (
    <>
      <PageHeading
        title="Knowledge Operations"
        description="Live operational readiness for the current Workspace, derived from durable Source, Worker, Run, Scheduler, Conversion, and ReadyPackage V2 evidence."
      />

      <OperationsReadinessPanel workspaceId={DEFAULT_WORKSPACE.id} />

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {operationalAreas.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.title}
              href={item.href}
              className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-slate-100 text-slate-700">
                <Icon size={18} aria-hidden="true" />
              </span>
              <p className="mt-4 font-semibold text-slate-950">{item.title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
                Open <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </section>
    </>
  );
}
