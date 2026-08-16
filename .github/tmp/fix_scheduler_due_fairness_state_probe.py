from pathlib import Path

path = Path("packages/persistence/tests/collection-scheduler.test.ts")
text = path.read_text()
old = '''    expect(scheduler.getState(freshPlan.plan.id).lastTriggeredAt).toBeUndefined();

    // Once due work consumed the bounded slot, the fresh plan can initialize next.
'''
new = '''    expect(
      database
        .prepare("SELECT plan_id FROM collection_schedule_states WHERE plan_id = ?")
        .get(freshPlan.plan.id),
    ).toBeUndefined();

    // Once due work consumed the bounded slot, the fresh plan can initialize next.
'''
if text.count(old) != 1:
    raise SystemExit(f"fresh plan state probe anchor count={text.count(old)}")
path.write_text(text.replace(old, new, 1))
