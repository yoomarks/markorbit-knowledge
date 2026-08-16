from pathlib import Path

priority = Path('packages/persistence/src/priority-national-source-coverage.ts')
text = priority.read_text()
old = '  ...DIP_TH_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,\n'
new = '  ...DIP_TH_SOURCE_COVERAGE_TARGETS,\n  ...CIPC_ZA_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,\n'
if old not in text:
    raise SystemExit('priority aggregate anchor not found')
priority.write_text(text.replace(old, new, 1))

catalog = Path('packages/persistence/src/source-coverage-catalog.ts')
text = catalog.read_text()
anchor = '  DIP_TH_SOURCE_COVERAGE_TARGETS,\n'
if text.count(anchor) < 2:
    raise SystemExit('catalog Thailand anchors missing')
text = text.replace(anchor, anchor + '  CIPC_ZA_SOURCE_COVERAGE_TARGETS,\n', 2)
catalog.write_text(text)

pt = Path('packages/persistence/tests/priority-national-source-coverage.test.ts')
text = pt.read_text()
imp = '  DIP_TH_SOURCE_COVERAGE_TARGETS,\n'
if imp not in text:
    raise SystemExit('priority test import anchor missing')
text = text.replace(imp, imp + '  CIPC_ZA_SOURCE_COVERAGE_TARGETS,\n', 1)
auth = '  ["TH", DIP_TH_SOURCE_COVERAGE_TARGETS, ["ipthailand.go.th"]],\n'
if auth not in text:
    raise SystemExit('priority test authority anchor missing')
text = text.replace(auth, auth + '  ["ZA", CIPC_ZA_SOURCE_COVERAGE_TARGETS, ["cipc.co.za"]],\n', 1)
text = text.replace(
    'ships explicit, official, unique coverage for fifty-four priority national offices',
    'ships explicit, official, unique coverage for fifty-five priority national offices',
    1,
)
text = text.replace('toHaveLength(424)', 'toHaveLength(433)', 1)
text = text.replace('      424,\n', '      433,\n', 1)
text = text.replace('    ).toBe(424);\n', '    ).toBe(433);\n', 1)
pt.write_text(text)

rt = Path('packages/persistence/tests/retrieval-relevance-audit.test.ts')
text = rt.read_text()
text = text.replace('expect(targets).toHaveLength(402);', 'expect(targets).toHaveLength(410);', 1)
text = text.replace(
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(402);',
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(410);',
    1,
)
text = text.replace('      402,\n', '      410,\n', 1)
th_check = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "TH", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
if th_check not in text:
    raise SystemExit('retrieval TH jurisdiction anchor missing')
za_check = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "ZA", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
text = text.replace(th_check, th_check + za_check, 1)
rt.write_text(text)
