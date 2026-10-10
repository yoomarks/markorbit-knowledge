import type { TmclassDomProjection } from "@markorbit/worker-runtime";

export interface TmclassProjectablePage {
  evaluate<Result>(pageFunction: string): Promise<Result>;
}

// Keep this as browser-native JavaScript so tsx build helpers cannot leak into page evaluation.
const TMCLASS_DOM_PROJECTION_EXPRESSION = String.raw`(() => {
  const clean = (value) => (value ?? "").replace(/\s+/gu, " ").trim();
  const details = {};
  const detailContainers = Array.from(document.querySelectorAll(".concept-info-row > div"));
  for (const container of detailContainers) {
    const key = clean(container.querySelector("small")?.textContent).replace(/:\s*$/u, "");
    if (key) details[key] = clean(container.querySelector("strong")?.textContent);
  }
  const acceptedContainer = detailContainers.find(
    (container) => container.matches(".hideTm5") || container.querySelector("strong > span") !== null,
  );
  const tables = Array.from(document.querySelectorAll("table")).map((table) => ({
    headers: Array.from(table.querySelectorAll("thead th")).map((cell) => clean(cell.textContent)),
    rows: Array.from(table.querySelectorAll("tbody tr")).map((row) => ({
      className: row.className,
      cells: Array.from(row.querySelectorAll("td")).map((cell) => ({
        text: clean(cell.textContent),
        links: Array.from(cell.querySelectorAll("a")).map((link) => ({
          text: clean(link.textContent),
          href: link.href,
        })),
        marker: cell.querySelector("img") !== null,
      })),
    })),
  }));
  const footerText = Array.from(document.querySelectorAll("div"))
    .map((element) => clean(element.textContent))
    .filter((value) => /^No\.\s*of\s*masters:/iu.test(value))
    .sort((left, right) => left.length - right.length)[0];
  return {
    documentLanguage: clean(document.documentElement.lang).toLowerCase(),
    heading: clean(document.querySelector("h2")?.textContent),
    title: clean(document.querySelector(".english_master_title h4")?.textContent),
    status: clean(document.querySelector(".concept-status-msg")?.textContent),
    details,
    detailValues: detailContainers.map((container) => clean(container.querySelector("strong")?.textContent)),
    scopeTitle: clean(
      document.querySelector("#concept-top-details-container img[title]")?.getAttribute("title"),
    ),
    taxonomyText: clean(document.querySelector("#tree-path-plain-show")?.textContent),
    acceptedOfficeTexts: acceptedContainer
      ? Array.from(acceptedContainer.querySelectorAll("strong > span")).map((office) => clean(office.textContent))
      : [],
    tables,
    footerText: footerText ?? "",
  };
})()`;

export function projectTmclassPage(page: TmclassProjectablePage): Promise<TmclassDomProjection> {
  return page.evaluate<TmclassDomProjection>(TMCLASS_DOM_PROJECTION_EXPRESSION);
}
