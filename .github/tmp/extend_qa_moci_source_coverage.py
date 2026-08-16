from pathlib import Path

priority_path = Path("packages/persistence/src/priority-national-source-coverage.ts")
priority_test_path = Path("packages/persistence/tests/priority-national-source-coverage.test.ts")

FEE_PDF = "https://www.moci.gov.qa/wp-content/uploads/2023/08/%D8%AC%D8%AF%D9%88%D9%84-%D8%B1%D8%B3%D9%88%D9%85-%D8%AE%D8%AF%D9%85%D8%A7%D8%AA-%D8%A7%D9%84%D8%B9%D9%84%D8%A7%D9%85%D8%A7%D8%AA-%D8%A7%D9%84%D8%AA%D8%AC%D8%A7%D8%B1%D9%8A%D8%A9.pdf"
NICE_PDF = "https://www.moci.gov.qa/wp-content/uploads/2026/03/%D8%AA%D8%B5%D9%86%D9%8A%D9%81-%D9%86%D9%8A%D8%B3-13-2026.pdf"
MADRID_GUIDE = "https://www.moci.gov.qa/en/our-services/investor/intellectual-property-rights/protect-your-trademark-overseas-using-the-madrid-system/"
MADRID_GAZETTE = "https://www.moci.gov.qa/en/media-center/statistics-and-reports/official-trademark-gazette-madrid-no-md1/"


def target_block(text: str, target_id: str) -> tuple[int, int, str]:
    marker = f'id: "{target_id}"'
    marker_at = text.index(marker)
    start = text.rfind("  target(MOCI_QA, {", 0, marker_at)
    end = text.index("  }),", marker_at) + len("  }),")
    return start, end, text[start:end]


def add_entrypoint(text: str, target_id: str, uri: str, label: str) -> str:
    start, end, block = target_block(text, target_id)
    anchor = "    entrypoints: [\n"
    if anchor not in block:
        raise RuntimeError(f"{target_id}: entrypoints anchor missing")
    insertion = f'      {{ uri: "{uri}", label: "{label}" }},\n'
    if uri in block:
        return text
    block = block.replace(anchor, anchor + insertion, 1)
    return text[:start] + block + text[end:]


priority = priority_path.read_text()
priority = add_entrypoint(
    priority,
    "qa-moci-trademark-fees",
    FEE_PDF,
    "Official MOCI trademark fee table PDF",
)
priority = add_entrypoint(
    priority,
    "qa-moci-trademark-classification",
    NICE_PDF,
    "Current MOCI Nice Classification 13-2026 PDF",
)

qatar_start = priority.index("export const MOCI_QA_SOURCE_COVERAGE_TARGETS = [")
qatar_end = priority.index("] satisfies readonly SourceCoverageTarget[];", qatar_start)
extra = f'''  target(MOCI_QA, {{
    id: "qa-moci-madrid",
    family: "FILING",
    displayName: "Qatar MOCI Madrid System Filing Guidance",
    canonicalUri: "{MADRID_GUIDE}",
    coverageTier: "SUPPORTING",
    entrypoints: [
      {{ uri: "{MADRID_GUIDE}", label: "MOCI Madrid System guidance" }},
      {{ uri: "https://efiling.madrid.wipo.int/", label: "Madrid e-Filing" }},
    ],
    verificationEvidenceUri: "{MADRID_GUIDE}",
    notes:
      "Qatar joined the Madrid System on 3 May 2024. MOCI publishes office-of-origin guidance and directs Qatar basic-mark holders to Madrid e-Filing.",
  }}),
  target(MOCI_QA, {{
    id: "qa-moci-madrid-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Qatar MOCI Official Trademark Gazette - Madrid",
    canonicalUri: "{MADRID_GAZETTE}",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "{MADRID_GAZETTE}",
    notes:
      "MOCI maintains a separate official Madrid trademark gazette with numbered publication batches for international marks affecting Qatar.",
  }}),
'''
if 'id: "qa-moci-madrid"' not in priority:
    priority = priority[:qatar_end] + extra + priority[qatar_end:]
priority_path.write_text(priority)

priority_test = priority_test_path.read_text()
priority_test = priority_test.replace("toHaveLength(324)", "toHaveLength(326)", 1)
priority_test = priority_test.replace("      324,\n", "      326,\n", 1)
priority_test = priority_test.replace("    ).toBe(324);", "    ).toBe(326);", 1)
priority_test_path.write_text(priority_test)
