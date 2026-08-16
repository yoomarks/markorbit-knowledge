from pathlib import Path

priority = Path('packages/persistence/src/priority-national-source-coverage.ts')
text = priority.read_text()
old = '  ...IPOPHL_PH_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,\n'
new = '  ...IPOPHL_PH_SOURCE_COVERAGE_TARGETS,\n  ...DJKI_ID_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,\n'
if old not in text:
    raise SystemExit('priority aggregate anchor not found')
priority.write_text(text.replace(old, new, 1))

catalog = Path('packages/persistence/src/source-coverage-catalog.ts')
text = catalog.read_text()
anchor = '  IPOPHL_PH_SOURCE_COVERAGE_TARGETS,\n'
if text.count(anchor) < 2:
    raise SystemExit('catalog IPOPHL anchors missing')
text = text.replace(anchor, anchor + '  DJKI_ID_SOURCE_COVERAGE_TARGETS,\n', 2)
catalog.write_text(text)

pt = Path('packages/persistence/tests/priority-national-source-coverage.test.ts')
text = pt.read_text()
imp = '  IPOPHL_PH_SOURCE_COVERAGE_TARGETS,\n'
if imp not in text:
    raise SystemExit('priority test import anchor missing')
text = text.replace(imp, imp + '  DJKI_ID_SOURCE_COVERAGE_TARGETS,\n', 1)
auth = '  ["PH", IPOPHL_PH_SOURCE_COVERAGE_TARGETS, ["ipophil.gov.ph"]],\n'
if auth not in text:
    raise SystemExit('priority test authority anchor missing')
text = text.replace(auth, auth + '  ["ID", DJKI_ID_SOURCE_COVERAGE_TARGETS, ["dgip.go.id"]],\n', 1)
text = text.replace(
    'ships explicit, official, unique coverage for fifty priority national offices',
    'ships explicit, official, unique coverage for fifty-one priority national offices',
    1,
)
text = text.replace('toHaveLength(391)', 'toHaveLength(400)', 1)
text = text.replace('      391,\n', '      400,\n', 1)
text = text.replace('    ).toBe(391);\n', '    ).toBe(400);\n', 1)
pt.write_text(text)

rt = Path('packages/persistence/tests/retrieval-relevance-audit.test.ts')
text = rt.read_text()
text = text.replace('expect(targets).toHaveLength(373);', 'expect(targets).toHaveLength(381);', 1)
text = text.replace(
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(373);',
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(381);',
    1,
)
text = text.replace('      373,\n', '      381,\n', 1)
ph = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "PH", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
if ph not in text:
    raise SystemExit('retrieval PH jurisdiction anchor missing')
id_check = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "ID", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
text = text.replace(ph, ph + id_check, 1)
rt.write_text(text)
