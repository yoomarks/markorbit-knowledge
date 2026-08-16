from pathlib import Path

path = Path("packages/persistence/src/collection-scheduler.ts")
text = path.read_text()
old = '''         WHERE p.status = 'ACTIVE' AND p.schedule_mode <> 'MANUAL'
         ORDER BY CASE WHEN s.plan_id IS NULL THEN 0 ELSE 1 END,
                  CASE WHEN s.next_due_at IS NULL THEN 0 ELSE 1 END,
                  s.next_due_at ASC,
                  p.id ASC
         LIMIT ?`,
      )
      .all(limit) as Array<{ document_json: string }>;
'''
new = '''         WHERE p.status = 'ACTIVE' AND p.schedule_mode <> 'MANUAL'
         ORDER BY CASE
                    WHEN s.next_due_at IS NOT NULL AND s.next_due_at <= ? THEN 0
                    WHEN s.plan_id IS NULL OR s.next_due_at IS NULL THEN 1
                    ELSE 2
                  END,
                  s.next_due_at ASC,
                  p.updated_at ASC,
                  p.id ASC
         LIMIT ?`,
      )
      .all(now.toISOString(), limit) as Array<{ document_json: string }>;
'''
if text.count(old) != 1:
    raise SystemExit(f"scheduler tick ordering anchor count={text.count(old)}")
path.write_text(text.replace(old, new, 1))

test_path = Path("packages/persistence/tests/collection-scheduler.test.ts")
test = test_path.read_text()
anchor = '''  it("coalesces later schedule slots while the previous run is still in flight", () => {
'''
addition = '''  it("prioritizes due plans over newly-created uninitialized plans when tick capacity is bounded", () => {
    const { database, sources, plans, scheduler, runs, setNow } = repositories();
    const dueSource = sources.create(sourceInput());
    const duePlan = plans.create(planInput(dueSource.id));

    // Initialize the older plan while it is not yet due.
    const initial = scheduler.tick({ limit: 1 });
    expect(initial.items[0]).toMatchObject({ planId: duePlan.plan.id, outcome: "INITIALIZED" });

    // Add a fresh plan with no scheduler state just before the older plan becomes due.
    setNow("2026-08-12T00:59:59.000Z");
    const freshSource = sources.create(
      sourceInput({
        name: "Fresh source",
        slug: "fresh-source",
        canonicalUri: "https://example.net/fresh",
        entrypoints: [{ uri: "https://example.net/fresh" }],
      }),
    );
    const freshPlan = plans.create(planInput(freshSource.id, { name: "Fresh plan" }));

    setNow("2026-08-12T01:00:00.000Z");
    const dueTick = scheduler.tick({ limit: 1 });
    expect(dueTick.dispatched).toBe(1);
    expect(dueTick.items[0]).toMatchObject({ planId: duePlan.plan.id, outcome: "DISPATCHED" });
    expect(runs.list({ planId: duePlan.plan.id }).total).toBe(1);
    expect(scheduler.getState(freshPlan.plan.id).lastTriggeredAt).toBeNull();

    // Once due work consumed the bounded slot, the fresh plan can initialize next.
    const nextTick = scheduler.tick({ limit: 1 });
    expect(nextTick.items[0]).toMatchObject({ planId: freshPlan.plan.id, outcome: "INITIALIZED" });
    database.close();
  });

  it("orders overdue plans by oldest due slot before future or uninitialized work", () => {
    const { database, sources, plans, scheduler, setNow } = repositories();
    const firstSource = sources.create(sourceInput());
    const firstPlan = plans.create(planInput(firstSource.id));
    const secondSource = sources.create(
      sourceInput({
        name: "Second source",
        slug: "second-source",
        canonicalUri: "https://example.org/second",
        entrypoints: [{ uri: "https://example.org/second" }],
      }),
    );
    const secondPlan = plans.create(planInput(secondSource.id, { name: "Second plan" }));
    scheduler.tick({ limit: 2 });

    // Move the second plan one slot later so the first plan is more overdue.
    database
      .prepare("UPDATE collection_schedule_states SET next_due_at = ? WHERE plan_id = ?")
      .run("2026-08-12T02:00:00.000Z", secondPlan.plan.id);
    setNow("2026-08-12T03:00:00.000Z");
    const tick = scheduler.tick({ limit: 1 });
    expect(tick.items[0]).toMatchObject({ planId: firstPlan.plan.id, outcome: "DISPATCHED" });
    database.close();
  });

'''
if test.count(anchor) != 1:
    raise SystemExit(f"scheduler fairness test anchor count={test.count(anchor)}")
test_path.write_text(test.replace(anchor, addition + anchor, 1))
