from pathlib import Path

path = Path("packages/persistence/src/priority-national-source-coverage.ts")
text = path.read_text()
old = 'https://www.ipo.gov.uk/tmjournal'
new = 'https://www.ipo.gov.uk/t-tmj.htm'
if text.count(old) != 1:
    raise SystemExit(f"expected one UK journal URL, found {text.count(old)}")
path.write_text(text.replace(old, new, 1))
