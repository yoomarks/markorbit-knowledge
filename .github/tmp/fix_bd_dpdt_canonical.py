from pathlib import Path

p = Path("packages/persistence/src/priority-national-source-coverage.ts")
text = p.read_text()
old = '''    id: "bd-dpdt-trademarks",
    family: "PORTAL",
    displayName: "Bangladesh DPDT Trademark Services",
    canonicalUri: "https://dpdt.gov.bd/pages/static-pages/6922df0e933eb65569e1f8de",'''
new = '''    id: "bd-dpdt-trademarks",
    family: "PORTAL",
    displayName: "Bangladesh DPDT Trademark Services",
    canonicalUri: "https://dpdt.gov.bd/",'''
assert old in text
p.write_text(text.replace(old, new, 1))
