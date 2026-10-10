import { describe, expect, it } from "vitest";
import {
  WipoMgsValidationError,
  buildWipoMgsTermEntities,
  diffWipoMgsSnapshots,
  parseWipoMgsLanguageRegistry,
  parseWipoMgsSnapshot,
} from "./wipo-source-adapter";

const sample = (language: string, niceClass: number, rows: Array<Record<string, unknown>>) =>
  parseWipoMgsSnapshot(JSON.stringify(rows), {
    requestLanguage: language,
    niceClass,
  });

describe("WIPO MGS source adapter", () => {
  it("discovers request-language mappings instead of assuming locale codes are API codes", () => {
    const html = `
      <script>
        languageOptions = '[
          { "code" : "en", "name": "English", "link": "?lang=en"},
          { "code" : "ja", "name": "日本語", "link": "?lang=jp"},
          { "code" : "ko", "name": "한국어", "link": "?lang=kr"},
          { "code" : "pt-BR", "link": "?lang=br"}
        ]'
      </script>`;

    expect(parseWipoMgsLanguageRegistry(html)).toEqual([
      { localeCode: "en", requestLanguage: "en", displayName: "English" },
      { localeCode: "ja", requestLanguage: "jp", displayName: "日本語" },
      { localeCode: "ko", requestLanguage: "kr", displayName: "한국어" },
      { localeCode: "pt-BR", requestLanguage: "br", displayName: "pt-BR" },
    ]);
  });

  it("normalizes a request-language response to its public locale while preserving raw lng", () => {
    const snapshot = parseWipoMgsSnapshot(
      JSON.stringify([{ id: 1, cls: 1, lng: "jp", txt: "化学品" }]),
      { requestLanguage: "jp", localeCode: "ja", niceClass: 1 },
    );

    expect(snapshot.records[0]?.language).toBe("ja");
    expect(snapshot.records[0]?.rawPayload.lng).toBe("jp");
  });

  it("preserves source fields and separates accepted, rejected, unknown and conflict states", () => {
    const snapshot = sample("en", 1, [
      {
        id: 768723,
        cls: "1",
        lng: "en",
        seq: 15,
        src: "NICE",
        txt: "2-naphthol",
        acc: "AT, AU, US",
        rej: "US;CA",
        prf: "sample",
        futureField: { retained: true },
      },
      {
        id: "900001",
        cls: 1,
        lng: "en",
        txt: "industrial chemicals",
        acc: "GB",
      },
    ]);

    expect(snapshot.recordCount).toBe(2);
    expect(snapshot.records[0]).toMatchObject({
      sourceTermId: "768723",
      niceClass: 1,
      language: "en",
      termText: "2-naphthol",
      accRaw: "AT, AU, US",
      rejRaw: "US;CA",
      acceptedJurisdictions: ["AT", "AU", "US"],
      rejectedJurisdictions: ["CA", "US"],
      jurisdictionStatuses: [
        { jurisdictionCode: "AT", status: "accepted" },
        { jurisdictionCode: "AU", status: "accepted" },
        { jurisdictionCode: "CA", status: "rejected" },
        { jurisdictionCode: "US", status: "conflict" },
      ],
    });
    expect(snapshot.records[0]?.rawPayload.futureField).toEqual({ retained: true });
    expect(snapshot.records[1]?.rejRaw).toBeNull();
    expect(snapshot.records[1]?.jurisdictionStatuses).toEqual([
      { jurisdictionCode: "GB", status: "accepted" },
    ]);
    expect(snapshot.records[1]?.jurisdictionStatuses).not.toContainEqual({
      jurisdictionCode: "US",
      status: "rejected",
    });
  });

  it("associates official localized terms by id and class without filling missing translations", () => {
    const en = sample("en", 1, [
      { id: 768723, cls: 1, lng: "en", txt: "2-naphthol", acc: "AU" },
      { id: 800000, cls: 1, lng: "en", txt: "English only term", acc: "AU" },
    ]);
    const zh = sample("zh", 1, [{ id: 768723, cls: 1, lng: "zh", txt: "2-萘酚", acc: "CN" }]);
    const ar = sample("ar", 1, [{ id: 768723, cls: 1, lng: "ar", txt: "2-نفثول", acc: "EG" }]);

    const result = buildWipoMgsTermEntities([en, zh, ar]);
    const shared = result.entities.find((item) => item.sourceTermId === "768723");
    const englishOnly = result.entities.find((item) => item.sourceTermId === "800000");

    expect(Object.keys(shared?.localizedTerms ?? {}).sort()).toEqual(["ar", "en", "zh"]);
    expect(shared?.localizedTerms.zh?.termText).toBe("2-萘酚");
    expect(englishOnly?.localizedTerms.en?.termText).toBe("English only term");
    expect(englishOnly?.localizedTerms.zh).toBeUndefined();
    expect(result.anomalies).toEqual([]);
  });

  it("records count drift as an anomaly instead of declaring a valid smaller locale incomplete", () => {
    const snapshot = parseWipoMgsSnapshot(
      JSON.stringify([{ id: 1, cls: 2, lng: "en", txt: "paints" }]),
      { requestLanguage: "en", niceClass: 2, historicalExpectedCount: 766 },
    );

    expect(snapshot.recordCount).toBe(1);
    expect(snapshot.anomalies).toEqual([
      {
        code: "COUNT_CHANGED",
        message: "MGS returned 1 records; historical comparison count is 766",
      },
    ]);
  });

  it("diffs additions, changes and not-observed terms while retaining unchanged hashes", () => {
    const before = sample("en", 1, [
      { id: 1, cls: 1, lng: "en", txt: "unchanged", acc: "AU" },
      { id: 2, cls: 1, lng: "en", txt: "before", acc: "AU" },
      { id: 3, cls: 1, lng: "en", txt: "missing later", acc: "AU" },
    ]);
    const after = sample("en", 1, [
      { id: 1, cls: 1, lng: "en", txt: "unchanged", acc: "AU" },
      { id: 2, cls: 1, lng: "en", txt: "after", acc: "AU,GB" },
      { id: 4, cls: 1, lng: "en", txt: "new", acc: "GB" },
    ]);

    const diff = diffWipoMgsSnapshots(before, after);
    expect(diff.unchanged.map((item) => item.sourceTermId)).toEqual(["1"]);
    expect(diff.changed.map((item) => item.after.sourceTermId)).toEqual(["2"]);
    expect(diff.notObserved.map((item) => item.sourceTermId)).toEqual(["3"]);
    expect(diff.added.map((item) => item.sourceTermId)).toEqual(["4"]);
  });

  it.each([
    ["HTML restriction", "<html>captcha</html>", "MGS_ACCESS_RESTRICTED"],
    ["empty array", "[]", "MGS_EMPTY_RESULT"],
    [
      "language mismatch",
      JSON.stringify([{ id: 1, cls: 1, lng: "zh", txt: "term" }]),
      "MGS_LANGUAGE_MISMATCH",
    ],
    [
      "class mismatch",
      JSON.stringify([{ id: 1, cls: 2, lng: "en", txt: "term" }]),
      "MGS_CLASS_MISMATCH",
    ],
    [
      "duplicate id",
      JSON.stringify([
        { id: 1, cls: 1, lng: "en", txt: "one" },
        { id: 1, cls: 1, lng: "en", txt: "two" },
      ]),
      "MGS_DUPLICATE_ID",
    ],
  ])("rejects %s", (_name, body, code) => {
    try {
      parseWipoMgsSnapshot(body, { requestLanguage: "en", niceClass: 1 });
    } catch (error) {
      expect(error).toBeInstanceOf(WipoMgsValidationError);
      expect((error as WipoMgsValidationError).code).toBe(code);
      return;
    }
    throw new Error(`Expected ${code}`);
  });
});
