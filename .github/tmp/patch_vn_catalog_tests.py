from pathlib import Path

priority = Path('packages/persistence/src/priority-national-source-coverage.ts')
text = priority.read_text()
old = '  ...DJKI_ID_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,\n'
new = '  ...DJKI_ID_SOURCE_COVERAGE_TARGETS,\n  ...IPVN_VN_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,\n'
if old not in text:
    raise SystemExit('priority aggregate anchor not found')
priority.write_text(text.replace(old, new, 1))

catalog = Path('packages/persistence/src/source-coverage-catalog.ts')
text = catalog.read_text()
anchor = '  DJKI_ID_SOURCE_COVERAGE_TARGETS,\n'
if text.count(anchor) < 2:
    raise SystemExit('catalog DJKI anchors missing')
text = text.replace(anchor, anchor + '  IPVN_VN_SOURCE_COVERAGE_TARGETS,\n', 2)
catalog.write_text(text)

pt = Path('packages/persistence/tests/priority-national-source-coverage.test.ts')
text = pt.read_text()
imp = '  DJKI_ID_SOURCE_COVERAGE_TARGETS,\n'
if imp not in text:
    raise SystemExit('priority test import anchor missing')
text = text.replace(imp, imp + '  IPVN_VN_SOURCE_COVERAGE_TARGETS,\n', 1)
auth = '  ["ID", DJKI_ID_SOURCE_COVERAGE_TARGETS, ["dgip.go.id"]],\n'
if auth not in text:
    raise SystemExit('priority test authority anchor missing')
text = text.replace(auth, auth + '  ["VN", IPVN_VN_SOURCE_COVERAGE_TARGETS, ["ipvietnam.gov.vn"]],\n', 1)
text = text.replace(
    'ships explicit, official, unique coverage for fifty-one priority national offices',
    'ships explicit, official, unique coverage for fifty-two priority national offices',
    1,
)
text = text.replace('toHaveLength(400)', 'toHaveLength(407)', 1)
text = text.replace('      400,\n', '      407,\n', 1)
text = text.replace('    ).toBe(400);\n', '    ).toBe(407);\n', 1)
pt.write_text(text)

rt = Path('packages/persistence/tests/retrieval-relevance-audit.test.ts')
text = rt.read_text()
text = text.replace('expect(targets).toHaveLength(381);', 'expect(targets).toHaveLength(387);', 1)
text = text.replace(
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(381);',
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(387);',
    1,
)
text = text.replace('      381,\n', '      387,\n', 1)
id_check = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "ID", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
if id_check not in text:
    raise SystemExit('retrieval ID jurisdiction anchor missing')
vn_check = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "VN", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
text = text.replace(id_check, id_check + vn_check, 1)
rt.write_text(text)
