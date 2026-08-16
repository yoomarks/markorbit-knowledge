from pathlib import Path

p = Path("packages/persistence/tests/priority-national-source-coverage.test.ts")
text = p.read_text()
old = '''    expect(new Set(PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS.map((item) => item.id)).size).toBe(
      358,
    );'''
new = '''    expect(new Set(PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS.map((item) => item.id)).size).toBe(
      366,
    );'''
assert old in text
p.write_text(text.replace(old, new, 1))

p = Path("packages/persistence/tests/retrieval-relevance-audit.test.ts")
text = p.read_text()
old = '''    expect(new Set(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES.map((probe) => probe.id)).size).toBe(
      344,
    );'''
new = '''    expect(new Set(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES.map((probe) => probe.id)).size).toBe(
      351,
    );'''
assert old in text
p.write_text(text.replace(old, new, 1))
