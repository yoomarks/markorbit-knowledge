import { describe, expect, it } from "vitest";
import {
  tmclassRoute,
  tmclassSourcePageFromDomProjection,
  type TmclassDomCell,
  type TmclassDomProjection,
  type TmclassDomRow,
  type TmclassDomTable,
} from "./tmclass-dom-source-page.js";

const cell = (text: string, href?: string, marker = false): TmclassDomCell => ({
  text,
  links: href ? [{ text, href }] : [],
  marker,
});

const row = (cells: TmclassDomCell[], className = ""): TmclassDomRow => ({
  className,
  cells,
});

const table = (headers: string[], rows: TmclassDomRow[]): TmclassDomTable => ({ headers, rows });

const conceptProjection = (tables: TmclassDomTable[] = []): TmclassDomProjection => ({
  heading: "Concept overview",
  title: "Abrasives (Auxiliary fluids for use with -)",
  status: "Published",
  details: {
    Class: "1",
    Source: "ILPO Supplement",
    "common.date": "",
    "Reference ID": "0024010",
    Scope: "",
  },
  scopeTitle: "Accepted",
  taxonomyText: "Class 1 >",
  acceptedOfficeTexts: [],
  tables,
  footerText: "No. of masters: 1 | No. of variants: 1",
});

describe("TMclass DOM source-page normalization", () => {
  it("retains term acceptance, translations, taxonomy, and source-scoped references", () => {
    const projection: TmclassDomProjection = {
      heading: "Term details (English)",
      title: "Abrasives (Auxiliary fluids for use with -)",
      status: "",
      details: { Class: "1", Language: "English", "Accepted by": "" },
      scopeTitle: "",
      taxonomyText:
        "Class 1 > Chemical substances, chemical materials and chemical preparations, and natural elements",
      acceptedOfficeTexts: ["Belize (BELIPO)", "OAPI"],
      tables: [
        table(
          ["Language", "Nice Class", "Text", "Quality"],
          [
            row([
              cell("bg"),
              cell("1"),
              cell("Помощни флуиди", "/ec2/term/248"),
              cell("Terminology"),
            ]),
          ],
        ),
        table(
          ["Source", "Concept reference"],
          [
            row([
              cell("ILPO Supplement", "/ec2/terminologysource/293"),
              cell("0024010", "/ec2/concept/11452493"),
            ]),
            row([
              cell("Nice (IPONZ)", "/ec2/terminologysource/564"),
              cell("0024010", "/ec2/concept/17729293"),
            ]),
          ],
        ),
      ],
      footerText: "",
    };

    expect(
      tmclassSourcePageFromDomProjection("https://euipo.europa.eu/ec2/term/262", projection),
    ).toMatchObject({
      pageKind: "TERM",
      termId: "262",
      niceClass: 1,
      languageCode: "en",
      acceptedBy: [
        { name: "Belize", code: "BELIPO" },
        { name: "OAPI", code: null },
      ],
      translationTargets: [{ termId: "248", languageCode: "bg", quality: "Terminology" }],
      sources: [
        { conceptId: "11452493", sourceName: "ILPO Supplement", referenceId: "0024010" },
        { conceptId: "17729293", sourceName: "Nice (IPONZ)", referenceId: "0024010" },
      ],
    });
  });

  it("normalizes localized term labels from stable structure and document language", () => {
    const projection: TmclassDomProjection = {
      documentLanguage: "ja",
      heading: "用語の詳細 (日本語)",
      title: "エンジン冷却液の沸騰防止剤",
      status: "",
      details: { 分類: "1", 言語: "日本語", 以下により受け入れられています: "" },
      detailValues: ["1", "日本語", "日本 (JPO)"],
      scopeTitle: "",
      taxonomyText: "Class 1 >",
      acceptedOfficeTexts: ["日本 (JPO)"],
      tables: [
        table(
          ["言語", "ニース分類", "本文", "質"],
          [
            row([
              cell("en"),
              cell("1"),
              cell("Anti-boil preparations", "/ec2/term/1"),
              cell("Pivot"),
            ]),
          ],
        ),
        table(
          ["情報源", "概念のリファレンス"],
          [row([cell("Nice (JPO)"), cell("010645", "/ec2/concept/17852621")])],
        ),
      ],
      footerText: "",
    };

    expect(
      tmclassSourcePageFromDomProjection("https://euipo.europa.eu/ec2/term/119617623", projection),
    ).toMatchObject({
      pageKind: "TERM",
      termId: "119617623",
      niceClass: 1,
      languageCode: "ja",
      languageLabel: "日本語",
      acceptedBy: [{ name: "日本", code: "JPO" }],
      sources: [{ conceptId: "17852621", sourceName: "Nice (JPO)", referenceId: "010645" }],
    });
  });

  it("preserves a term with no available translation targets", () => {
    const projection: TmclassDomProjection = {
      documentLanguage: "ja",
      heading: "用語の詳細 (日本語)",
      title: "洗車用手袋",
      status: "",
      details: {},
      detailValues: ["21", "日本語", "日本 (JPO)"],
      scopeTitle: "",
      taxonomyText: "Class 21 >",
      acceptedOfficeTexts: ["日本 (JPO)"],
      tables: [
        table(
          ["情報源", "概念のリファレンス"],
          [row([cell("Nice (JPO)"), cell("210123", "/ec2/concept/17852622")])],
        ),
      ],
      footerText: "",
    };

    expect(
      tmclassSourcePageFromDomProjection("https://euipo.europa.eu/ec2/term/245938379", projection),
    ).toMatchObject({ translationTargets: [] });
  });

  it("retains concept status, source identity, scope, per-language master, and counts", () => {
    const projection = conceptProjection([
      table(
        ["Language", "Master term", "No. of variants", "No. of total terms", ""],
        [
          row([
            cell("en"),
            cell("Abrasives (Auxiliary fluids for use with -)", "/ec2/term/262"),
            cell("1"),
            cell("2"),
            cell(""),
          ]),
        ],
      ),
    ]);

    expect(
      tmclassSourcePageFromDomProjection(
        "https://euipo.europa.eu/ec2/concept/11452493",
        projection,
      ),
    ).toEqual({
      pageKind: "CONCEPT_OVERVIEW",
      conceptId: "11452493",
      title: "Abrasives (Auxiliary fluids for use with -)",
      status: "Published",
      niceClass: 1,
      sourceName: "ILPO Supplement",
      sourceDateText: null,
      referenceId: "0024010",
      scopeStatus: "Accepted",
      taxonomy: [{ label: "Class 1", sourceNodeId: null }],
      languages: [
        {
          languageCode: "en",
          masterTermId: "262",
          masterTermText: "Abrasives (Auxiliary fluids for use with -)",
          variantCount: 1,
          totalTermCount: 2,
        },
      ],
      masterCount: 1,
      variantCount: 1,
    });
  });

  it("models Master and Variant as roles of independent Terms in one Concept", () => {
    const projection = conceptProjection([
      table(
        ["Term", "Master term", "Variant"],
        [
          row(
            [
              cell("Abrasives (Auxiliary fluids for use with -)", "/ec2/term/262"),
              cell("", undefined, true),
              cell(""),
            ],
            "master odd",
          ),
          row(
            [
              cell("Fluids for use with abrasives (Auxiliary -)", "/ec2/term/263"),
              cell(""),
              cell("", undefined, true),
            ],
            "equivalent even",
          ),
        ],
      ),
    ]);

    expect(
      tmclassSourcePageFromDomProjection(
        "https://euipo.europa.eu/ec2/concept/11452493/en",
        projection,
      ),
    ).toMatchObject({
      pageKind: "CONCEPT_LANGUAGE",
      languageCode: "en",
      terms: [
        { termId: "262", role: "MASTER", ordinal: 1 },
        { termId: "263", role: "VARIANT", ordinal: 2 },
      ],
    });
  });

  it("accepts only exact official detail routes", () => {
    expect(tmclassRoute("https://euipo.europa.eu/ec2/concept/11452493/en")).toEqual({
      pageKind: "CONCEPT_LANGUAGE",
      conceptId: "11452493",
      languageCode: "en",
    });
    expect(() => tmclassRoute("https://example.com/ec2/term/262")).toThrow(
      "TMCLASS_SOURCE_URI_INVALID",
    );
    expect(() => tmclassRoute("https://euipo.europa.eu/ec2/term/262?token=secret")).toThrow(
      "TMCLASS_SOURCE_URI_INVALID",
    );
  });
});
