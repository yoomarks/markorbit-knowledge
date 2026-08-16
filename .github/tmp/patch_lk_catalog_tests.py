from pathlib import Path

priority = Path('packages/persistence/src/priority-national-source-coverage.ts')
text = priority.read_text()
old = '  ...IPVN_VN_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,\n'
new = '  ...IPVN_VN_SOURCE_COVERAGE_TARGETS,\n  ...NIPO_LK_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,\n'
if old not in text:
    raise SystemExit('priority aggregate anchor not found')
priority.write_text(text.replace(old, new, 1))

catalog = Path('packages/persistence/src/source-coverage-catalog.ts')
text = catalog.read_text()
anchor = '  IPVN_VN_SOURCE_COVERAGE_TARGETS,\n'
if text.count(anchor) < 2:
    raise SystemExit('catalog IPVN anchors missing')
text = text.replace(anchor, anchor + '  NIPO_LK_SOURCE_COVERAGE_TARGETS,\n', 2)
catalog.write_text(text)

pt = Path('packages/persistence/tests/priority-national-source-coverage.test.ts')
text = pt.read_text()
imp = '  IPVN_VN_SOURCE_COVERAGE_TARGETS,\n'
if imp not in text:
    raise SystemExit('priority test import anchor missing')
text = text.replace(imp, imp + '  NIPO_LK_SOURCE_COVERAGE_TARGETS,\n', 1)
auth = '  ["VN", IPVN_VN_SOURCE_COVERAGE_TARGETS, ["ipvietnam.gov.vn"]],\n'
if auth not in text:
    raise SystemExit('priority test authority anchor missing')
text = text.replace(
    auth,
    auth + '  ["LK", NIPO_LK_SOURCE_COVERAGE_TARGETS, ["nipo.gov.lk", "lk.wipo.net"]],\n',
    1,
)
text = text.replace(
    'ships explicit, official, unique coverage for fifty-two priority national offices',
    'ships explicit, official, unique coverage for fifty-three priority national offices',
    1,
)
text = text.replace('toHaveLength(407)', 'toHaveLength(415)', 1)
text = text.replace('      407,\n', '      415,\n', 1)
text = text.replace('    ).toBe(407);\n', '    ).toBe(415);\n', 1)
pt.write_text(text)

rt = Path('packages/persistence/tests/retrieval-relevance-audit.test.ts')
text = rt.read_text()
text = text.replace('expect(targets).toHaveLength(387);', 'expect(targets).toHaveLength(394);', 1)
text = text.replace(
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(387);',
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(394);',
    1,
)
text = text.replace('      387,\n', '      394,\n', 1)
vn_check = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "VN", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
if vn_check not in text:
    raise SystemExit('retrieval VN jurisdiction anchor missing')
lk_check = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "LK", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
text = text.replace(vn_check, vn_check + lk_check, 1)
rt.write_text(text)
