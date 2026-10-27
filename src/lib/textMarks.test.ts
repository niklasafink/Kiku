import { describe, expect, it } from "vitest";
import { locator, markText, unmarkAt, type TextPiece } from "./textMarks";

/** The pieces as RichText hands them over, found in the text. */
function piecesOf(text: string, shown: string[], marked: string[] = []): TextPiece[] {
  const find = locator(text);
  return shown.map((piece) => ({ at: find(piece), length: piece.length, marked: marked.includes(piece) }));
}

describe("markText", () => {
  it("marks the words between two positions", () => {
    const text = "Der Kaufpreis ist zu aktivieren.";
    expect(markText(text, piecesOf(text, [text]), 4, 13)).toBe("Der ==Kaufpreis== ist zu aktivieren.");
  });

  it("leaves spaces at the edges outside the marking", () => {
    const text = "a  b  c";
    expect(markText(text, piecesOf(text, [text]), 1, 6)).toBe("a  ==b==  c");
  });

  it("marks across bold piece by piece, never cutting through the markup", () => {
    const text = "Die **AfA** beginnt im Monat";
    const pieces = piecesOf(text, ["Die ", "AfA", " beginnt im Monat"]);
    expect(markText(text, pieces, 0, 19)).toBe("==Die== **==AfA==** ==beginnt== im Monat");
  });

  it("marks line by line", () => {
    const text = "erste Zeile\nzweite Zeile";
    expect(markText(text, piecesOf(text, [text]), 6, 18)).toBe("erste ==Zeile==\n==zweite== Zeile");
  });

  it("skips what is marked already and pieces it cannot place", () => {
    const text = "alt ==neu== frei";
    const pieces = [...piecesOf(text, ["alt ", "neu", " frei"], ["neu"]), { at: -1, length: 3, marked: false }];
    expect(markText(text, pieces, 0, text.length)).toBe("==alt== ==neu== ==frei==");
  });

  it("does not mark next to an equals sign", () => {
    const text = "a=b";
    expect(markText(text, piecesOf(text, [text]), 2, 3)).toBe("a=b");
  });
});

describe("unmarkAt", () => {
  it("takes away the marking around a position", () => {
    expect(unmarkAt("vor ==mitte== nach", 7)).toBe("vor mitte nach");
  });

  it("finds the right one of several markings, also with bold inside", () => {
    expect(unmarkAt("==eins== und ==**zwei** drei==", 20)).toBe("==eins== und **zwei** drei");
  });

  it("leaves the text alone where nothing is marked", () => {
    expect(unmarkAt("==eins== zwei", 10)).toBe("==eins== zwei");
    expect(unmarkAt("==eins==\nzwei", 10)).toBe("==eins==\nzwei");
  });
});

describe("locator", () => {
  it("finds repeated words in reading order", () => {
    const find = locator("a **a** a");
    expect([find("a "), find("a"), find(" a")]).toEqual([0, 4, 7]);
    expect(find("fehlt")).toBe(-1);
  });
});
