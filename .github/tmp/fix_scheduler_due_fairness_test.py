from pathlib import Path

path = Path("packages/persistence/tests/collection-scheduler.test.ts")
text = path.read_text()
old = '''    expect(scheduler.getState(freshPlan.plan.id).lastTriggeredAt).toBeNull();
'''
new = '''    expect(scheduler.getState(freshPlan.plan.id).lastTriggeredAt).toBeUndefined();
'''
if text.count(old) != 1:
    raise SystemExit(f"fresh plan optional state assertion count={text.count(old)}")
path.write_text(text.replace(old, new, 1))
