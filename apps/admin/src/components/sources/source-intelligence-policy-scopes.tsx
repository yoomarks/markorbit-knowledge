"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Layers3, RefreshCw, Save, Users } from "lucide-react";
import type {
  SourceDefinition,
  SourceIntelligencePolicyCohortV2,
  SourceIntelligencePolicyScopeAndCohortsV2,
} from "@markorbit/contracts";
import type { SourceListResult } from "@markorbit/persistence";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";

const SOURCE_LIMIT = 100;

type Snapshot = {
  policyScopes: SourceIntelligencePolicyScopeAndCohortsV2 | null;
  sources: SourceDefinition[];
};

function targetInput(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function parseTarget(value: string, label: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 8760) {
    throw new Error(`${label}必须是 1–8760 的整数小时，留空表示关闭`);
  }
  return parsed;
}

function formatTarget(value: number | null): string {
  if (value === null) return "关闭";
  return value < 24 ? `${value}h` : `${Math.round((value / 24) * 10) / 10}d`;
}

async function readSnapshot(signal?: AbortSignal): Promise<Snapshot> {
  const sourceResponse = await fetch(`/api/sources?limit=${SOURCE_LIMIT}&offset=0`, { signal });
  const sourceBody = (await sourceResponse.json()) as
    SourceListResult | { error?: { message?: string } };
  if (!sourceResponse.ok) {
    const message = "error" in sourceBody ? sourceBody.error?.message : undefined;
    throw new Error(message ?? "无法读取 Sources");
  }
  const sources = (sourceBody as SourceListResult).items;
  if (sources.length === 0) return { policyScopes: null, sources };

  const params = new URLSearchParams({
    protocolVersion: "2.0",
    sourceIds: sources.map((source) => source.id).join(","),
  });
  const response = await fetch(`/api/source-intelligence/reviews/policy-scopes?${params}`, {
    signal,
  });
  const body = (await response.json()) as {
    policyScopes?: SourceIntelligencePolicyScopeAndCohortsV2;
    error?: { message?: string };
  };
  if (!response.ok || !body.policyScopes) {
    throw new Error(body.error?.message ?? "无法读取 D2.14 policy scopes");
  }
  return { policyScopes: body.policyScopes, sources };
}

export function SourceIntelligencePolicyScopes() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ policyScopes: null, sources: [] });
  const [actor, setActor] = useState("admin-console");
  const [editingCohortId, setEditingCohortId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("100");
  const [claimTarget, setClaimTarget] = useState("");
  const [reviewTarget, setReviewTarget] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [membershipCohortId, setMembershipCohortId] = useState("");
  const [membershipSourceId, setMembershipSourceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applySnapshot = useCallback((next: Snapshot) => {
    setSnapshot(next);
    const firstCohort = next.policyScopes?.cohorts[0]?.cohortId ?? "";
    const firstSource = next.sources[0]?.id ?? "";
    setMembershipCohortId((current) => current || firstCohort);
    setMembershipSourceId((current) => current || firstSource);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      applySnapshot(await readSnapshot());
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "无法读取 D2.14 policy scopes",
      );
    } finally {
      setLoading(false);
    }
  }, [applySnapshot]);

  useEffect(() => {
    const controller = new AbortController();
    void readSnapshot(controller.signal)
      .then((next) => {
        applySnapshot(next);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(
          requestError instanceof Error ? requestError.message : "无法读取 D2.14 policy scopes",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [applySnapshot]);

  const editingCohort = useMemo(
    () =>
      snapshot.policyScopes?.cohorts.find((cohort) => cohort.cohortId === editingCohortId) ?? null,
    [editingCohortId, snapshot.policyScopes?.cohorts],
  );

  function resetEditor() {
    setEditingCohortId(null);
    setName("");
    setDescription("");
    setPriority("100");
    setClaimTarget("");
    setReviewTarget("");
    setEnabled(true);
  }

  function editCohort(cohort: SourceIntelligencePolicyCohortV2) {
    setEditingCohortId(cohort.cohortId);
    setName(cohort.name);
    setDescription(cohort.description ?? "");
    setPriority(String(cohort.priority));
    setClaimTarget(targetInput(cohort.claimTargetHours));
    setReviewTarget(targetInput(cohort.reviewTargetHours));
    setEnabled(cohort.enabled);
  }

  async function saveCohort() {
    const operator = actor.trim();
    if (!operator) return setError("请先填写当前 Operator label");
    if (!name.trim()) return setError("请填写 Cohort 名称");
    const parsedPriority = Number(priority);
    if (!Number.isInteger(parsedPriority) || parsedPriority <= 0 || parsedPriority > 10000) {
      return setError("Priority 必须是 1–10000 的整数；数字越大优先级越高");
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/source-intelligence/reviews/policy-scopes", {
        method: "PUT",
        headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          protocolVersion: "2.0",
          ...(editingCohortId ? { cohortId: editingCohortId } : {}),
          name: name.trim(),
          description,
          priority: parsedPriority,
          enabled,
          claimTargetHours: parseTarget(claimTarget, "领取目标"),
          reviewTargetHours: parseTarget(reviewTarget, "复核目标"),
          expectedUpdatedAt: editingCohort?.updatedAt ?? null,
        }),
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "无法保存 policy cohort");
      resetEditor();
      applySnapshot(await readSnapshot());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法保存 policy cohort");
    } finally {
      setSaving(false);
    }
  }

  async function changeMembership() {
    const operator = actor.trim();
    if (!operator) return setError("请先填写当前 Operator label");
    if (!membershipCohortId || !membershipSourceId) return setError("请选择 Cohort 和 Source");
    const present = Boolean(
      snapshot.policyScopes?.memberships.some(
        (membership) =>
          membership.cohortId === membershipCohortId && membership.sourceId === membershipSourceId,
      ),
    );
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/source-intelligence/reviews/policy-scopes", {
        method: "POST",
        headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          protocolVersion: "2.0",
          cohortId: membershipCohortId,
          sourceId: membershipSourceId,
          action: present ? "REMOVED" : "ADDED",
          expectedPresent: present,
        }),
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "无法修改 Cohort membership");
      applySnapshot(await readSnapshot());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法修改 Cohort membership");
    } finally {
      setSaving(false);
    }
  }

  const { policyScopes, sources } = snapshot;
  const selectedMembershipPresent = Boolean(
    policyScopes?.memberships.some(
      (membership) =>
        membership.cohortId === membershipCohortId && membership.sourceId === membershipSourceId,
    ),
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Layers3 size={19} className="text-violet-700" aria-hidden="true" />
            <h2 className="font-semibold text-slate-950">D2.14 · Policy Scope &amp; Cohorts</h2>
          </div>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">
            用人工显式 Cohort 为不同 Source 设置不同 workflow targets。Membership
            不从域名、机构、类别或 Source Value 推断；启用 Cohort 以唯一 Priority
            决定优先级，数字越大越优先，Global D2.13 policy 仅作
            fallback。不会自动分组、派单、升级、通知或执行。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} aria-hidden="true" />
          重新读取
        </button>
      </div>

      {error ? (
        <div className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {loading ? <div className="p-6 text-sm text-slate-500">正在读取 Policy Scope…</div> : null}
      {!loading && !policyScopes ? (
        <div className="p-6 text-sm text-slate-500">当前没有 Source 可用于 Policy Scope。</div>
      ) : null}

      {policyScopes ? (
        <div className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {[
              ["Sources", policyScopes.counts.sourceCount],
              ["Cohorts", policyScopes.counts.cohortCount],
              ["Enabled", policyScopes.counts.enabledCohortCount],
              ["Cohort scoped", policyScopes.counts.cohortScopedSourceCount],
              ["Global fallback", policyScopes.counts.globalFallbackSourceCount],
              ["Multi-cohort", policyScopes.counts.multiCohortSourceCount],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4">
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-medium text-slate-600">
                Operator label
                <input
                  value={actor}
                  onChange={(event) => setActor(event.target.value)}
                  maxLength={120}
                  className="mt-1 block w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Cohort 名称
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                  className="mt-1 block w-48 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Priority
                <input
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
                  inputMode="numeric"
                  className="mt-1 block w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                领取目标 h
                <input
                  value={claimTarget}
                  onChange={(event) => setClaimTarget(event.target.value)}
                  placeholder="关闭"
                  inputMode="numeric"
                  className="mt-1 block w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                复核目标 h
                <input
                  value={reviewTarget}
                  onChange={(event) => setReviewTarget(event.target.value)}
                  placeholder="关闭"
                  inputMode="numeric"
                  className="mt-1 block w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                />
              </label>
              <label className="inline-flex items-center gap-2 pb-2 text-xs font-medium text-slate-600">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => setEnabled(event.target.checked)}
                />{" "}
                启用
              </label>
              <button
                type="button"
                onClick={() => void saveCohort()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Save size={15} /> {editingCohortId ? "更新 Cohort" : "创建 Cohort"}
              </button>
              {editingCohortId ? (
                <button
                  type="button"
                  onClick={resetEditor}
                  className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700"
                >
                  取消编辑
                </button>
              ) : null}
            </div>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="可选说明：只记录人工定义的用途，不用于自动分类"
              maxLength={1000}
              className="mt-3 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2">
              <Users size={17} className="text-violet-700" />
              <h3 className="text-sm font-semibold text-slate-900">Explicit Membership</h3>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-xs font-medium text-slate-600">
                Cohort
                <select
                  value={membershipCohortId}
                  onChange={(event) => setMembershipCohortId(event.target.value)}
                  className="mt-1 block w-56 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                >
                  <option value="">选择 Cohort</option>
                  {policyScopes.cohorts.map((cohort) => (
                    <option key={cohort.cohortId} value={cohort.cohortId}>
                      {cohort.name} · P{cohort.priority}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">
                Source
                <select
                  value={membershipSourceId}
                  onChange={(event) => setMembershipSourceId(event.target.value)}
                  className="mt-1 block w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                >
                  <option value="">选择 Source</option>
                  {sources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.id}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void changeMembership()}
                disabled={saving || !membershipCohortId || !membershipSourceId}
                className="rounded-lg border border-violet-300 bg-violet-50 px-3.5 py-2 text-sm font-semibold text-violet-800 disabled:opacity-50"
              >
                {selectedMembershipPresent ? "移出 Cohort" : "加入 Cohort"}
              </button>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            {policyScopes.cohorts.length === 0 ? (
              <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">
                尚未创建 Cohort，当前全部 Source 使用 Global fallback。
              </div>
            ) : (
              policyScopes.cohorts.map((cohort) => {
                const members = policyScopes.memberships.filter(
                  (membership) => membership.cohortId === cohort.cohortId,
                );
                return (
                  <div key={cohort.cohortId} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-slate-950">{cohort.name}</h3>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${cohort.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-100 text-slate-600"}`}
                          >
                            {cohort.enabled ? "Enabled" : "Disabled"}
                          </span>
                          <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800">
                            Priority {cohort.priority}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          领取 {formatTarget(cohort.claimTargetHours)} · 复核{" "}
                          {formatTarget(cohort.reviewTargetHours)} · {members.length} Sources
                        </p>
                        {cohort.description ? (
                          <p className="mt-2 text-sm text-slate-600">{cohort.description}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => editCohort(cohort)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
                      >
                        编辑
                      </button>
                    </div>
                    {members.length > 0 ? (
                      <p className="mt-3 break-words text-xs leading-5 text-slate-500">
                        {members.map((membership) => membership.sourceId).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Effective scope</th>
                  <th className="px-4 py-3">Targets</th>
                  <th className="px-4 py-3">Matched cohorts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {policyScopes.effectivePolicies.map((policy) => (
                  <tr key={policy.sourceId}>
                    <td className="px-4 py-3 font-medium text-slate-900">{policy.sourceId}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {policy.scope === "COHORT"
                        ? `${policy.cohortName} · P${policy.priority}`
                        : policy.scope === "GLOBAL"
                          ? "Global fallback"
                          : "Unconfigured"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      领取 {formatTarget(policy.claimTargetHours)} · 复核{" "}
                      {formatTarget(policy.reviewTargetHours)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {policy.matchedCohortIds.length || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
            Cohort 是人工 workflow metadata，不代表 Source
            的真实类别、权威性、法律状态或身份关系。Priority 只用于选择人工 SLA policy；不会成为
            Scheduler priority，也不会触发 collection、routing、notification 或 escalation。
          </div>
        </div>
      ) : null}
    </section>
  );
}
