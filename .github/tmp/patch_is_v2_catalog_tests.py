from pathlib import Path

priority = Path('packages/persistence/src/priority-national-source-coverage.ts')
text = priority.read_text()
old = '  ...SIC_CO_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,\n'
new = '  ...SIC_CO_SOURCE_COVERAGE_TARGETS,\n  ...ISIPO_IS_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,\n'
if old not in text:
    raise SystemExit('priority aggregate anchor not found')
priority.write_text(text.replace(old, new, 1))

catalog = Path('packages/persistence/src/source-coverage-catalog.ts')
text = catalog.read_text()
anchor = '  SIC_CO_SOURCE_COVERAGE_TARGETS,\n'
if text.count(anchor) < 2:
    raise SystemExit('catalog SIC CO anchors missing')
text = text.replace(anchor, anchor + '  ISIPO_IS_SOURCE_COVERAGE_TARGETS,\n', 2)
catalog.write_text(text)

pt = Path('packages/persistence/tests/priority-national-source-coverage.test.ts')
text = pt.read_text()
imp = '  SIC_CO_SOURCE_COVERAGE_TARGETS,\n'
if imp not in text:
    raise SystemExit('priority test import anchor missing')
text = text.replace(imp, imp + '  ISIPO_IS_SOURCE_COVERAGE_TARGETS,\n', 1)
auth = '  ["CO", SIC_CO_SOURCE_COVERAGE_TARGETS, ["sic.gov.co"]],\n'
if auth not in text:
    raise SystemExit('priority test authority anchor missing')
text = text.replace(auth, auth + '  ["IS", ISIPO_IS_SOURCE_COVERAGE_TARGETS, ["hugverk.is"]],\n', 1)
text = text.replace(
    'ships explicit, official, unique coverage for fifty-seven priority national offices',
    'ships explicit, official, unique coverage for fifty-eight priority national offices',
    1,
)
text = text.replace('toHaveLength(451)', 'toHaveLength(460)', 1)
text = text.replace('      451,\n', '      460,\n', 1)
text = text.replace('    ).toBe(451);\n', '    ).toBe(460);\n', 1)
pt.write_text(text)

rt = Path('packages/persistence/tests/retrieval-relevance-audit.test.ts')
text = rt.read_text()
text = text.replace('expect(targets).toHaveLength(426);', 'expect(targets).toHaveLength(434);', 1)
text = text.replace(
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(426);',
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(434);',
    1,
)
text = text.replace('      426,\n', '      434,\n', 1)
co_check = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "CO", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
if co_check not in text:
    raise SystemExit('retrieval CO jurisdiction anchor missing')
is_check = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "IS", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
text = text.replace(co_check, co_check + is_check, 1)
rt.write_text(text)
