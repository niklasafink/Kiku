import { describe, expect, it } from "vitest";
import { editorHtmlToMarkdown, markdownToEditorHtml } from "./editorHtml";
import { occlusionCards, parseOcclusion } from "./occlusion";
import { imageIds, parseInline, toPlainText } from "./richText";

const boxes = [
  { x: 120, y: 340.4, w: 200, h: 80, label: "Zellkern" },
  { x: 500, y: 100, w: 150, h: 60, label: " Mitochondrium " },
];

describe("occlusion", () => {
  it("makes one card per box, asking for that box and answering with its label", () => {
    const cards = occlusionCards("img-0001", boxes, "");
    expect(cards).toEqual([
      {
        question: "Was ist hier verdeckt?\n\n![occ:120,340,200,80;500,100,150,60#0](kiku-img:img-0001)",
        solution: "Zellkern\n\n![occ:120,340,200,80;500,100,150,60#0r](kiku-img:img-0001)",
      },
      {
        question: "Was ist hier verdeckt?\n\n![occ:120,340,200,80;500,100,150,60#1](kiku-img:img-0001)",
        solution: "Mitochondrium\n\n![occ:120,340,200,80;500,100,150,60#1r](kiku-img:img-0001)",
      },
    ]);
  });

  it("stays ordinary card text: the picture is found, the solution text is what gets graded", () => {
    const [card] = occlusionCards("img-0001", boxes, "Welches Organell?");
    expect(imageIds(card.question)).toEqual(["img-0001"]);
    expect(toPlainText(card.solution)).toBe("Zellkern");
    const image = parseInline(card.question.split("\n\n")[1])[0];
    expect(image.type === "image" && parseOcclusion(image.alt)).toEqual({
      boxes: [
        { x: 120, y: 340, w: 200, h: 80 },
        { x: 500, y: 100, w: 150, h: 60 },
      ],
      asked: 0,
      revealed: false,
    });
  });

  it("ignores alternative texts that are not boxes", () => {
    expect(parseOcclusion("Zelle")).toBeNull();
    expect(parseOcclusion("occ:1,2,3#0")).toBeNull();
    expect(parseOcclusion("occ:1,2,3,4#5")).toBeNull();
    expect(parseOcclusion("occ:1,2,3,4000#0")).toBeNull();
  });

  it("survives the visual editor", () => {
    const [card] = occlusionCards("img-0001", boxes, "");
    expect(editorHtmlToMarkdown(markdownToEditorHtml(card.question, () => "blob:x"))).toBe(card.question);
  });
});
