import { describe, expect, it } from "vitest";
import { containsForbiddenYamlSyntax } from "../src/staging-verification";

describe("staging frontmatter YAML token safety", () => {
  it.each([
    ['title: "Marks & Clerk"', false],
    ['title: "Fross Zelnick Lehrman & Zissu"', false],
    ['title: "literal * alias ! tag <<: merge"', false],
    ["title: 'Spruson & Ferguson'", false],
    ["danger: &anchor value", true],
    ["danger: *alias", true],
    ["danger: !tag value", true],
    ["<<: *defaults", true],
  ] as const)("classifies %s", (raw, expected) => {
    expect(containsForbiddenYamlSyntax(raw)).toBe(expected);
  });
});
