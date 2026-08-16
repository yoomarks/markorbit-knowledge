from pathlib import Path

path = Path("packages/persistence/src/priority-national-source-coverage.ts")
text = path.read_text()
old = '''  target(UPRP_PL, {\n    id: "pl-uprp-trademark-law-proceedings",\n    family: "LEGAL_TEXTS",\n    displayName: "UPRP Trademark Law and Opposition Procedure",\n    canonicalUri:\n      "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/znaki-towarowe-informacje-podstawowe",'''
new = '''  target(UPRP_PL, {\n    id: "pl-uprp-trademark-law-proceedings",\n    family: "LEGAL_TEXTS",\n    displayName: "UPRP Trademark Law and Opposition Procedure",\n    canonicalUri:\n      "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/procedura-krajowa-/procedura-sprzeciwowa",'''
if text.count(old) != 1:
    raise RuntimeError(f"expected one Poland law/proceedings canonical anchor, found {text.count(old)}")
path.write_text(text.replace(old, new, 1))
print("Poland UPRP canonical uniqueness fix applied")
