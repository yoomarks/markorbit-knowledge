from pathlib import Path

probe_path = Path("packages/persistence/src/retrieval-relevance-audit.ts")
test_path = Path("packages/persistence/tests/retrieval-relevance-audit.test.ts")

probes = probe_path.read_text(encoding="utf-8")
anchor = '''  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },'''
ipos = '''  { id: "sg-trademarks-name", targetId: "sg-ipos-trademarks", query: "trade marks" },
  {
    id: "sg-trademark-registration-name",
    targetId: "sg-ipos-trademark-registration",
    query: "register trade mark",
  },
  {
    id: "sg-trademark-search-name",
    targetId: "sg-ipos-trademark-search",
    query: "similar mark search",
  },
  {
    id: "sg-trademark-forms-fees-name",
    targetId: "sg-ipos-trademark-forms-fees",
    query: "forms fees",
  },
  {
    id: "sg-trademark-work-manual-name",
    targetId: "sg-ipos-trademark-guides-work-manual",
    query: "work manual",
  },
'''
if 'targetId: "sg-ipos-trademarks"' not in probes:
    if anchor not in probes:
        raise SystemExit("Canada probe insertion anchor not found")
    probes = probes.replace(anchor, ipos + anchor, 1)
probe_path.write_text(probes, encoding="utf-8")

tests = test_path.read_text(encoding="utf-8")
for old, new in [
    ("expect(targets).toHaveLength(63);", "expect(targets).toHaveLength(68);"),
    ("expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(63);", "expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(68);"),
    (".size).toBe(63);", ".size).toBe(68);"),
]:
    if old in tests:
        tests = tests.replace(old, new, 1)
    elif new not in tests:
        raise SystemExit(f"retrieval relevance cardinality assertion not found: {old}")

sg_assertion = '''    expect(
      listSourceCoverageTargets({ jurisdiction: "SG", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
'''
eu_assertion = '''    expect(
      listSourceCoverageTargets({ jurisdiction: "EU", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
'''
if 'jurisdiction: "SG", coverageTier: "FOUNDATIONAL"' not in tests:
    if eu_assertion not in tests:
        raise SystemExit("EU foundational coverage assertion anchor not found")
    tests = tests.replace(eu_assertion, eu_assertion + sg_assertion, 1)

test_path.write_text(tests, encoding="utf-8")
