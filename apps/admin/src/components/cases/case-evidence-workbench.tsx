"use client";

import { useEffect, useState } from "react";
import type {
  CaseCandidateIntakeV1,
  CaseCandidateV1,
  CaseDossierV1,
  CaseEvidenceCollectionV1,
} from "@markorbit/contracts";

type AdminSession = {
  authenticated: true;
  workspaces: Array<{ workspaceId: string; name: string; role: string }>;
};

type InventoryItem = {
  candidate: CaseCandidateV1;
  intake: CaseCandidateIntakeV1;
  collections: CaseEvidenceCollectionV1[];
  dossiers: CaseDossierV1[];
};

type InventoryResponse = {
  items: InventoryItem[];
  summary: {
    total: number;
    pending: number;
    waitingSource: number;
    collected: number;
    evidenceCollections: number;
    dossiers: number;
  };
};
type ApiError = { error?: { message?: string } };

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | ApiError;
  if (!response.ok) {
    throw new Error(
      (body as ApiError).error?.message ?? `Request failed with HTTP ${response.status}`,
    );
  }
  return body as T;
}

const stateClasses: Record<CaseCandidateIntakeV1["collectionState"], string> = {
  PENDING: "bg-amber-50 text-amber-700",
  WAITING_SOURCE: "bg-rose-50 text-rose-700",
  COLLECTED: "bg-emerald-50 text-emerald-700",
};

export function CaseEvidenceWorkbench() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/admin-session", { cache: "no-store", credentials: "include" })
      .then((response) => responseJson<AdminSession>(response))
      .then((next) => {
        if (!active) return;
        setSession(next);
        setWorkspaceId(next.workspaces[0]?.workspaceId ?? "");
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "Failed to load Admin session");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!workspaceId) return;
    let active = true;
    void fetch("/api/case-evidence", {
      cache: "no-store",
      credentials: "include",
      headers: { "x-markorbit-workspace-id": workspaceId },
    })
      .then((response) => responseJson<InventoryResponse>(response))
      .then((next) => {
        if (!active) return;
        setData(next);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "Failed to load Case evidence");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);

  if (!session && !error) {
    return <p className="text-sm text-slate-500">正在解析 Admin workspace…</p>;
  }

  const summary = data?.summary;
  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {session && session.workspaces.length > 1 ? (
        <label className="block max-w-sm text-xs font-medium text-slate-600">
          Workspace
          <select
            value={workspaceId}
            onChange={(event) => {
              setLoading(true);
              setWorkspaceId(event.target.value);
            }}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
          >
            {session.workspaces.map((workspace) => (
              <option key={workspace.workspaceId} value={workspace.workspaceId}>
                {workspace.name} · {workspace.role}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Case Candidates", summary?.total ?? "—"],
          ["Pending / Waiting", summary ? `${summary.pending} / ${summary.waitingSource}` : "—"],
          ["Collected", summary?.collected ?? "—"],
          [
            "Evidence / Dossiers",
            summary ? `${summary.evidenceCollections} / ${summary.dossiers}` : "—",
          ],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      {loading ? <p className="text-sm text-slate-500">正在读取 Case evidence…</p> : null}
      {!loading && data?.items.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-semibold text-slate-900">
            当前 Workspace 尚无 Case Candidate。
          </p>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            MarkReg 仍是案件事实的权威生产方；当 MarkReg promotion Case Candidate
            后，会自动出现在这里并进入 evidence collection / dossier 链路。
          </p>
        </section>
      ) : null}
      <div className="space-y-4">
        {data?.items.map(({ candidate, intake, collections, dossiers }) => (
          <article
            key={candidate.candidateId}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span
                    className={`rounded-full px-2.5 py-1 font-semibold ${stateClasses[intake.collectionState]}`}
                  >
                    {intake.collectionState}
                  </span>
                  <span>{candidate.sourceSystem}</span>
                  <span>·</span>
                  <span>v{candidate.sourceMatterVersion}</span>
                </div>
                <h2 className="mt-3 text-base font-semibold text-slate-950">
                  {candidate.sourceMatterId}
                </h2>
                <p className="mt-1 text-xs text-slate-500">{candidate.candidateId}</p>
              </div>
              <div className="text-right text-xs text-slate-500">
                <p>{collections.length} evidence collection(s)</p>
                <p className="mt-1">{dossiers.length} dossier(s)</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-2">
              <div className="text-xs leading-5 text-slate-600">
                <p>
                  <span className="font-medium text-slate-800">Promoted:</span>{" "}
                  {candidate.promotedAt}
                </p>
                <p>
                  <span className="font-medium text-slate-800">Classification:</span>{" "}
                  {candidate.accessScope.classification}
                </p>
                <p>
                  <span className="font-medium text-slate-800">Snapshot:</span>{" "}
                  {candidate.sourceSnapshotSha256.slice(0, 16)}…
                </p>
              </div>
              <div className="text-xs leading-5 text-slate-600">
                <p>
                  <span className="font-medium text-slate-800">Collection ref:</span>{" "}
                  {intake.collectionRef ?? "—"}
                </p>
                <p>
                  <span className="font-medium text-slate-800">Collected:</span>{" "}
                  {intake.collectedAt ?? "—"}
                </p>
                {intake.sourceUnavailable ? (
                  <p className="text-rose-700">
                    {intake.sourceUnavailable.code}: {intake.sourceUnavailable.message}
                  </p>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
