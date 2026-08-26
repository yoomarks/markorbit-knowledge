export type KnowledgeReaderBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "divider" };

export type KnowledgeReaderFrontmatter = Record<string, string>;

export type KnowledgeReaderDocumentModel = {
  frontmatter: KnowledgeReaderFrontmatter;
  blocks: KnowledgeReaderBlock[];
};

function cleanInline(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function parseFrontmatter(lines: string[]): {
  frontmatter: KnowledgeReaderFrontmatter;
  bodyStart: number;
} {
  if (lines[0]?.trim() !== "---") return { frontmatter: {}, bodyStart: 0 };
  const closing = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (closing < 0) return { frontmatter: {}, bodyStart: 0 };

  const frontmatter: KnowledgeReaderFrontmatter = {};
  for (const line of lines.slice(1, closing)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    if (!key || !raw || raw === "|" || raw === ">") continue;
    frontmatter[key] = raw.replace(/^(["'])(.*)\1$/, "$2");
  }
  return { frontmatter, bodyStart: closing + 1 };
}

export function buildKnowledgeReaderModel(markdown: string): KnowledgeReaderDocumentModel {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const { frontmatter, bodyStart } = parseFrontmatter(lines);
  const body = lines.slice(bodyStart);
  const blocks: KnowledgeReaderBlock[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = cleanInline(paragraph.join(" "));
    if (text) blocks.push({ kind: "paragraph", text });
    paragraph = [];
  };
  const flushBullets = () => {
    if (bullets.length === 0) return;
    blocks.push({ kind: "bullet", items: bullets.map(cleanInline).filter(Boolean) });
    bullets = [];
  };

  for (const rawLine of body) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushBullets();
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushBullets();
      blocks.push({
        kind: "heading",
        level: heading[1]?.length as 1 | 2 | 3,
        text: cleanInline(heading[2] ?? ""),
      });
      continue;
    }
    if (/^([-*_])\1{2,}$/.test(line)) {
      flushParagraph();
      flushBullets();
      blocks.push({ kind: "divider" });
      continue;
    }
    const bullet = /^[-*+]\s+(.+)$/.exec(line);
    if (bullet) {
      flushParagraph();
      bullets.push(bullet[1] ?? "");
      continue;
    }
    if (line.startsWith(">")) {
      flushParagraph();
      flushBullets();
      blocks.push({ kind: "quote", text: cleanInline(line.slice(1)) });
      continue;
    }
    flushBullets();
    paragraph.push(line);
  }
  flushParagraph();
  flushBullets();

  return { frontmatter, blocks };
}
