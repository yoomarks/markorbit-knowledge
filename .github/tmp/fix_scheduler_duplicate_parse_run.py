from pathlib import Path

path = Path("packages/persistence/src/collection-scheduler.ts")
text = path.read_text()
duplicate = '''function parseRun(value: string): CollectionRun {
  const parsed = JSON.parse(value) as unknown;
  if (!isCollectionRun(parsed)) {
    throw new RegistryValidationError("Persisted CollectionRun no longer satisfies Execution Contract v1");
  }
  return parsed;
}

'''
if text.count(duplicate) != 1:
    raise SystemExit(f"duplicate parseRun count={text.count(duplicate)}")
path.write_text(text.replace(duplicate, "", 1))
