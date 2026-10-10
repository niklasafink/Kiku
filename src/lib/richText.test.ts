import { describe, expect, it } from "vitest";
import { imageIds, parseBlocks, parseInline, toMarkdownTable, toPlainText } from "./richText";

describe("parseBlocks", () => {
  it("keeps plain text as paragraphs with their line breaks", () => {
    expect(parseBlocks("Zeile 1\nZeile 2\n\nNeuer Absatz")).toEqual([
      { type: "paragraph", inlines: [{ type: "text", text: "Zeile 1\nZeile 2" }] },
      { type: "paragraph", inlines: [{ type: "text", text: "Neuer Absatz" }] },
    ]);
  });

  it("reads headings, lists with their numbers and nesting, and tables", () => {
    const blocks = parseBlocks("## Titel\n- a\n  - b\n3. drei\n4) vier\n\n| A | B |\n| --- | --- |\n| 1 | x \\| y |");
    expect(blocks.map((b) => b.type)).toEqual(["heading", "list", "list", "table"]);
    const [, bullets, numbers, table] = blocks;
    expect(bullets.type === "list" && bullets.items.map((i) => [i.depth, i.marker])).toEqual([
      [0, "•"],
      [1, "•"],
    ]);
    expect(numbers.type === "list" && numbers.items.map((i) => i.marker)).toEqual(["3.", "4."]);
    expect(table.type === "table" && table.rows[0][1]).toEqual([{ type: "text", text: "x | y" }]);
  });

  it("does not treat a line with pipes as a table without the divider row", () => {
    expect(parseBlocks("| a | b |")[0].type).toBe("paragraph");
  });
});

describe("parseInline", () => {
  it("reads bold, italic, marked text, code and pictures", () => {
    expect(parseInline("a **b *c* d** ==d== `e*f*` ![x](kiku-img:abc-123)")).toEqual([
      { type: "text", text: "a " },
      {
        type: "bold",
        children: [{ type: "text", text: "b " }, { type: "italic", children: [{ type: "text", text: "c" }] }, { type: "text", text: " d" }],
      },
      { type: "text", text: " " },
      { type: "mark", children: [{ type: "text", text: "d" }] },
      { type: "text", text: " " },
      { type: "code", text: "e*f*" },
      { type: "text", text: " " },
      { type: "image", id: "abc-123", alt: "x" },
    ]);
  });

  it("leaves stars in ordinary text alone", () => {
    expect(parseInline("2 * 3 * 4 und a*")).toEqual([{ type: "text", text: "2 * 3 * 4 und a*" }]);
  });
});

describe("toPlainText", () => {
  it("returns text without markup unchanged", () => {
    expect(toPlainText("Die Mitose hat vier Phasen.\n- Prophase")).toBe("Die Mitose hat vier Phasen.\n- Prophase");
  });

  it("removes markup and pictures but keeps the wording", () => {
    const text = "## Mitose\n**Kernteilung** in *vier* ==Phasen==\n\n![](kiku-img:abc)\n\n| Phase | Was |\n| --- | --- |\n| Pro | `x` |";
    expect(toPlainText(text)).toBe("Mitose\nKernteilung in vier Phasen\n\nPhase | Was\nPro | x");
    expect(imageIds(text)).toEqual(["abc"]);
  });

  it("is empty for a text that only holds a picture", () => {
    expect(toPlainText("![](kiku-img:abc)")).toBe("");
  });
});

describe("toMarkdownTable", () => {
  it("builds a table the parser reads back", () => {
    const markdown = toMarkdownTable([
      ["Phase", "Was passiert"],
      ["Pro|phase", "Zeile 1\nZeile 2"],
      ["Meta"],
    ]);
    const [table] = parseBlocks(markdown);
    expect(table.type === "table" && table.rows).toEqual([
      [[{ type: "text", text: "Pro|phase" }], [{ type: "text", text: "Zeile 1 Zeile 2" }]],
      [[{ type: "text", text: "Meta" }], []],
    ]);
  });
});
