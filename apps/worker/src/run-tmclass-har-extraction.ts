import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { extractTmclassHarPages } from "./tmclass-har-extractor.js";
import { projectTmclassPage } from "./tmclass-playwright-page-projector.js";

const MAX_HAR_BYTES = 250 * 1024 * 1024;

type Options = {
  inputs: string[];
  output: string;
  browserExecutable: string;
};

function options(argv: string[]): Options {
  const inputs: string[] = [];
  let output = "";
  let browserExecutable = process.env.MARKORBIT_TMCLASS_BROWSER_EXECUTABLE_PATH ?? "";
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--") continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    if (flag === "--input") inputs.push(path.resolve(value));
    else if (flag === "--output") output = path.resolve(value);
    else if (flag === "--browser-executable") browserExecutable = path.resolve(value);
    else throw new Error(`Unsupported argument ${flag}`);
    index += 1;
  }
  if (inputs.length === 0) throw new Error("At least one --input HAR file is required");
  if (!output) throw new Error("--output is required");
  if (!browserExecutable) {
    throw new Error(
      "--browser-executable or MARKORBIT_TMCLASS_BROWSER_EXECUTABLE_PATH is required",
    );
  }
  return { inputs: [...new Set(inputs)], output, browserExecutable };
}

async function main(): Promise<void> {
  const configured = options(process.argv.slice(2));
  const browser = await chromium.launch({
    executablePath: configured.browserExecutable,
    headless: true,
    timeout: 30_000,
  });
  try {
    const context = await browser.newContext({ javaScriptEnabled: false, locale: "en-US" });
    await context.route("**/*", (route) => route.abort());
    const browserPage = await context.newPage();
    const page = {
      setContent: (html: string, wait: { waitUntil: "domcontentloaded"; timeout: number }) =>
        browserPage.setContent(html, wait),
      project: () => projectTmclassPage(browserPage),
    };
    const captures = [];
    const seen = new Set<string>();
    for (const input of configured.inputs) {
      const metadata = await stat(input);
      if (!metadata.isFile() || metadata.size > MAX_HAR_BYTES) {
        throw new Error(`HAR input is not a bounded file: ${path.basename(input)}`);
      }
      const har = JSON.parse(await readFile(input, "utf8")) as unknown;
      for (const capture of await extractTmclassHarPages(har, page)) {
        const identity = `${capture.sourceUri}\n${capture.responseSha256}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        captures.push({ inputName: path.basename(input), ...capture });
      }
    }
    await mkdir(path.dirname(configured.output), { recursive: true });
    await writeFile(
      configured.output,
      JSON.stringify(
        {
          contractVersion: "TMCLASS_HAR_EXTRACTION_V1",
          objectType: "TMCLASS_HAR_EXTRACTION",
          sourceOwner: "MARKORBIT_KNOWLEDGE",
          sourceId: "EUIPO_TMCLASS",
          generatedAt: new Date().toISOString(),
          pageCount: captures.length,
          captures,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    process.stdout.write(
      JSON.stringify({ outcome: "TMCLASS_HAR_EXTRACTED", pageCount: captures.length }) + "\n",
    );
  } finally {
    await browser.close();
  }
}

await main();
