from pathlib import Path

path = Path("packages/persistence/src/priority-national-source-coverage.ts")
text = path.read_text()


def replace_canonical(target_id: str, old: str, new: str) -> None:
    global text
    marker = f'id: "{target_id}"'
    marker_at = text.index(marker)
    start = text.rfind("  target(MOIC_BH, {", 0, marker_at)
    end = text.index("  }),", marker_at) + len("  }),")
    block = text[start:end]
    old_line = f'    canonicalUri: "{old}",'
    new_line = f'    canonicalUri: "{new}",'
    if old_line not in block:
        raise RuntimeError(f"{target_id}: canonical anchor not found")
    block = block.replace(old_line, new_line, 1)
    text = text[:start] + block + text[end:]


replace_canonical(
    "bh-moic-trademark-search",
    "https://www.moic.gov.bh/en/node/2705",
    "https://service.moic.gov.bh/ipd",
)
replace_canonical(
    "bh-moic-trademark-proceedings",
    "https://www.moic.gov.bh/en/node/5889",
    "https://service.moic.gov.bh/ipd/login",
)

path.write_text(text)
