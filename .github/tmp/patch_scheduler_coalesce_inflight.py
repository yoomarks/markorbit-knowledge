from pathlib import Path

path = Path("packages/persistence/src/collection-scheduler.ts")
text = path.read_text()
text = text.replace(
'''export type CollectionSchedulerTickItem = {
  planId: string;
  outcome: "INITIALIZED" | "NOT_DUE" | "DISPATCHED" | "REPLAYED" | "ERROR";
''',
'''export type CollectionSchedulerTickItem = {
  planId: string;
  outcome: "INITIALIZED" | "NOT_DUE" | "DISPATCHED" | "REPLAYED" | "COALESCED" | "ERROR";
''', 1)
text = text.replace(
'''  dispatched: number;
  replayed: number;
  errors: number;
''',
'''  dispatched: number;
  replayed: number;
  coalesced: number;
  errors: number;
''', 1)
text = text.replace(
'''type ScheduledDispatchResult = {
  run: CollectionRun;
  jobs: Job[];
  replayed: boolean;
};
''',
'''type ScheduledDispatchResult = {
  run: CollectionRun;
  jobs: Job[];
  replayed: boolean;
  coalesced: boolean;
};
''', 1)

anchor = '''function existingScheduledRun(
'''
addition = '''function parseRun(value: string): CollectionRun {
  const parsed = JSON.parse(value) as unknown;
  if (!isCollectionRun(parsed)) {
    throw new RegistryValidationError("Persisted CollectionRun no longer satisfies Execution Contract v1");
  }
  return parsed;
}

function inFlightRunForPlan(database: DatabaseSync, planId: string): CollectionRun | null {
  const row = database
    .prepare(
      `SELECT document_json FROM collection_runs
       WHERE plan_id = ? AND status IN ('PENDING', 'RUNNING')
       ORDER BY requested_at DESC, id DESC
       LIMIT 1`,
    )
    .get(planId) as { document_json: string } | undefined;
  return row ? parseRun(row.document_json) : null;
}

function coalescedDispatch(run: CollectionRun): ScheduledDispatchResult {
  return { run, jobs: [], replayed: false, coalesced: true };
}

'''
if text.count(anchor) != 1:
    raise SystemExit(f"existingScheduledRun anchor count={text.count(anchor)}")
text = text.replace(anchor, addition + anchor, 1)
# existing replay return shapes: add coalesced false in function return.
text = text.replace('''  return { run, jobs, replayed: true };
}''', '''  return { run, jobs, replayed: true, coalesced: false };
}''', 1)

# In dispatchScheduled, check active run after same-slot replay, and recheck inside transaction.
old = '''    const replay = existingScheduledRun(this.database, plan.workspaceId, plan.id, idempotencyKey);
    if (replay) return replay;

    const timestamp = now.toISOString();
'''
new = '''    const replay = existingScheduledRun(this.database, plan.workspaceId, plan.id, idempotencyKey);
    if (replay) return replay;
    const active = inFlightRunForPlan(this.database, plan.id);
    if (active) return coalescedDispatch(active);

    const timestamp = now.toISOString();
'''
if text.count(old) != 1:
    raise SystemExit(f"dispatch preflight anchor count={text.count(old)}")
text = text.replace(old, new, 1)
old = '''    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database
        .prepare(
'''
new = '''    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const concurrentReplay = existingScheduledRun(
        this.database,
        plan.workspaceId,
        plan.id,
        idempotencyKey,
      );
      if (concurrentReplay) {
        this.database.exec("COMMIT;");
        return concurrentReplay;
      }
      const concurrentActive = inFlightRunForPlan(this.database, plan.id);
      if (concurrentActive) {
        this.database.exec("COMMIT;");
        return coalescedDispatch(concurrentActive);
      }
      this.database
        .prepare(
'''
# Occurs only in dispatchScheduled? check count; likely yes.
if text.count(old) != 1:
    raise SystemExit(f"dispatch transaction anchor count={text.count(old)}")
text = text.replace(old, new, 1)
text = text.replace('''      return { run, jobs: [job], replayed: false };
''', '''      return { run, jobs: [job], replayed: false, coalesced: false };
''', 1)
# Remove old unique race block's duplicate concurrentReplay const name, rename it after rollback to raceReplay.
old = '''        const concurrentReplay = existingScheduledRun(
          this.database,
          plan.workspaceId,
          plan.id,
          idempotencyKey,
        );
        if (concurrentReplay) return concurrentReplay;
'''
new = '''        const raceReplay = existingScheduledRun(
          this.database,
          plan.workspaceId,
          plan.id,
          idempotencyKey,
        );
        if (raceReplay) return raceReplay;
'''
if text.count(old) != 1:
    raise SystemExit(f"unique race replay anchor count={text.count(old)}")
text = text.replace(old, new, 1)

# Add coalesced state advancement that intentionally does not mark a new trigger/run.
anchor = '''  private advanceState(
'''
addition = '''  private advanceCoalescedState(
    plan: CollectionPlan,
    expectedSlot: string,
    now: Date,
  ): PersistedScheduleState {
    const slot = new Date(expectedSlot);
    const next = nextFutureScheduledAt(plan.schedule, slot, now);
    if (!next) {
      throw new RegistryValidationError("Automatic schedule did not produce a future slot");
    }
    const timestamp = now.toISOString();
    const result = this.database
      .prepare(
        `UPDATE collection_schedule_states
         SET next_due_at = ?, last_slot_at = ?,
             last_error_code = NULL, last_error_message = NULL, last_error_at = NULL,
             updated_at = ?
         WHERE plan_id = ? AND schedule_fingerprint = ? AND next_due_at = ?`,
      )
      .run(
        next.toISOString(),
        expectedSlot,
        timestamp,
        plan.id,
        scheduleFingerprint(plan.schedule),
        expectedSlot,
      );
    if (Number(result.changes) === 0) {
      const current = this.stateRow(plan.id);
      if (!current) {
        throw schedulerConflict(
          "SCHEDULER_STATE_LOST",
          "Scheduler state disappeared while coalescing an in-flight run",
        );
      }
      return current;
    }
    return this.stateRow(plan.id)!;
  }

'''
if text.count(anchor) != 1:
    raise SystemExit(f"advanceState anchor count={text.count(anchor)}")
text = text.replace(anchor, addition + anchor, 1)

# Tick counter + branch.
text = text.replace(
'''    let dispatched = 0;
    let replayed = 0;
    let errors = 0;
''',
'''    let dispatched = 0;
    let replayed = 0;
    let coalesced = 0;
    let errors = 0;
''', 1)
old = '''        const dispatch = this.dispatchScheduled(plan, new Date(state.nextDueAt), now);
        const advanced = this.advanceState(plan, state.nextDueAt, dispatch.run, now);
        if (dispatch.replayed) replayed += 1;
        else dispatched += 1;
        items.push({
          planId: plan.id,
          outcome: dispatch.replayed ? "REPLAYED" : "DISPATCHED",
          nextDueAt: advanced.nextDueAt,
          runId: dispatch.run.id,
        });
'''
new = '''        const dispatch = this.dispatchScheduled(plan, new Date(state.nextDueAt), now);
        if (dispatch.coalesced) {
          const advanced = this.advanceCoalescedState(plan, state.nextDueAt, now);
          coalesced += 1;
          items.push({
            planId: plan.id,
            outcome: "COALESCED",
            nextDueAt: advanced.nextDueAt,
            runId: dispatch.run.id,
          });
          continue;
        }
        const advanced = this.advanceState(plan, state.nextDueAt, dispatch.run, now);
        if (dispatch.replayed) replayed += 1;
        else dispatched += 1;
        items.push({
          planId: plan.id,
          outcome: dispatch.replayed ? "REPLAYED" : "DISPATCHED",
          nextDueAt: advanced.nextDueAt,
          runId: dispatch.run.id,
        });
'''
if text.count(old) != 1:
    raise SystemExit(f"tick dispatch block count={text.count(old)}")
text = text.replace(old, new, 1)
text = text.replace(
'''      dispatched,
      replayed,
      errors,
''',
'''      dispatched,
      replayed,
      coalesced,
      errors,
''', 1)
path.write_text(text)

# Tests.
test_path = Path("packages/persistence/tests/collection-scheduler.test.ts")
test = test_path.read_text()
insert_anchor = '''  it("replays the exact schedule slot after restart-like state lag instead of duplicating runs", () => {
'''
addition = '''  it("coalesces later schedule slots while the previous run is still in flight", () => {
    const { database, sources, plans, scheduler, runs, setNow } = repositories();
    const source = sources.create(sourceInput());
    const plan = plans.create(planInput(source.id));
    scheduler.tick();

    setNow("2026-08-12T01:00:00.000Z");
    const first = scheduler.tick();
    expect(first.dispatched).toBe(1);
    const firstRun = runs.list({ planId: plan.plan.id }).items[0]!.run;
    expect(firstRun.status).toBe("PENDING");

    setNow("2026-08-12T02:00:00.000Z");
    const second = scheduler.tick();
    expect(second.dispatched).toBe(0);
    expect(second.coalesced).toBe(1);
    expect(second.items[0]).toMatchObject({ outcome: "COALESCED", runId: firstRun.id });
    expect(runs.list({ planId: plan.plan.id }).total).toBe(1);
    expect(scheduler.getState(plan.plan.id).nextDueAt).toBe("2026-08-12T03:00:00.000Z");

    setNow("2026-08-12T05:30:00.000Z");
    const catchUp = scheduler.tick();
    expect(catchUp.coalesced).toBe(1);
    expect(runs.list({ planId: plan.plan.id }).total).toBe(1);
    expect(scheduler.getState(plan.plan.id).nextDueAt).toBe("2026-08-12T06:00:00.000Z");
    database.close();
  });

  it("coalesces a scheduled slot onto an in-flight manual run for the same plan", () => {
    const { database, sources, plans, scheduler, runs, setNow } = repositories();
    const source = sources.create(sourceInput());
    const plan = plans.create(planInput(source.id));
    scheduler.tick();
    setNow("2026-08-12T00:30:00.000Z");
    const manual = runs.dispatchManual({ planId: plan.plan.id }).record.run;

    setNow("2026-08-12T01:00:00.000Z");
    const tick = scheduler.tick();
    expect(tick.coalesced).toBe(1);
    expect(tick.items[0]).toMatchObject({ outcome: "COALESCED", runId: manual.id });
    expect(runs.list({ planId: plan.plan.id }).total).toBe(1);
    expect(scheduler.getState(plan.plan.id).nextDueAt).toBe("2026-08-12T02:00:00.000Z");
    database.close();
  });

'''
if test.count(insert_anchor) != 1:
    raise SystemExit(f"scheduler test anchor count={test.count(insert_anchor)}")
test = test.replace(insert_anchor, addition + insert_anchor, 1)
# strengthen exact-slot replay regression, making sure it is not counted as coalesced.
old = '''    const replay = restarted.tick();
    expect(replay.replayed).toBe(1);
'''
new = '''    const replay = restarted.tick();
    expect(replay.replayed).toBe(1);
    expect(replay.coalesced).toBe(0);
    expect(replay.items[0]?.outcome).toBe("REPLAYED");
'''
if test.count(old) != 1:
    raise SystemExit(f"scheduler replay assertion anchor count={test.count(old)}")
test_path.write_text(test.replace(old, new, 1))
