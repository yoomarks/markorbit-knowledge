from pathlib import Path

priority = Path('packages/persistence/src/priority-national-source-coverage.ts')
text = priority.read_text()
old = '  ...NIPO_LK_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,\n'
new = '  ...NIPO_LK_SOURCE_COVERAGE_TARGETS,\n  ...DIP_TH_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,\n'
if old not in text:
    raise SystemExit('priority aggregate anchor not found')
priority.write_text(text.replace(old, new, 1))

catalog = Path('packages/persistence/src/source-coverage-catalog.ts')
text = catalog.read_text()
anchor = '  NIPO_LK_SOURCE_COVERAGE_TARGETS,\n'
if text.count(anchor) < 2:
    raise SystemExit('catalog NIPO LK anchors missing')
text = text.replace(anchor, anchor + '  DIP_TH_SOURCE_COVERAGE_TARGETS,\n', 2)
catalog.write_text(text)

pt = Path('packages/persistence/tests/priority-national-source-coverage.test.ts')
text = pt.read_text()
imp = '  NIPO_LK_SOURCE_COVERAGE_TARGETS,\n'
if imp not in text:
    raise SystemExit('priority test import anchor missing')
text = text.replace(imp, imp + '  DIP_TH_SOURCE_COVERAGE_TARGETS,\n', 1)
auth = '  ["LK", NIPO_LK_SOURCE_COVERAGE_TARGETS, ["nipo.gov.lk", "lk.wipo.net"]],\n'
if auth not in text:
    raise SystemExit('priority test authority anchor missing')
text = text.replace(auth, auth + '  ["TH", DIP_TH_SOURCE_COVERAGE_TARGETS, ["ipthailand.go.th"]],\n', 1)
text = text.replace(
    'ships explicit, official, unique coverage for fifty-three priority national offices',
    'ships explicit, official, unique coverage for fifty-four priority national offices',
    1,
)
text = text.replace('toHaveLength(415)', 'toHaveLength(424)', 1)
text = text.replace('      415,\n', '      424,\n', 1)
text = text.replace('    ).toBe(415);\n', '    ).toBe(424);\n', 1)
pt.write_text(text)

rt = Path('packages/persistence/tests/retrieval-relevance-audit.test.ts')
text = rt.read_text()
text = text.replace('expect(targets).toHaveLength(394);', 'expect(targets).toHaveLength(402);', 1)
text = text.replace(
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(394);',
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(402);',
    1,
)
text = text.replace('      394,\n', '      402,\n', 1)
lk_check = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "LK", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
if lk_check not in text:
    raise SystemExit('retrieval LK jurisdiction anchor missing')
th_check = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "TH", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
text = text.replace(lk_check, lk_check + th_check, 1)
rt.write_text(text)
