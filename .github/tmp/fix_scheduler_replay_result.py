from pathlib import Path

path = Path("packages/persistence/src/collection-scheduler.ts")
text = path.read_text()
old = '''  return { run, jobs: jobsForRun(database, run.id), replayed: true };
'''
new = '''  return { run, jobs: jobsForRun(database, run.id), replayed: true, coalesced: false };
'''
if text.count(old) != 1:
    raise SystemExit(f"scheduled replay result anchor count={text.count(old)}")
path.write_text(text.replace(old, new, 1))
