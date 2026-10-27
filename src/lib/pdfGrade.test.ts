import { describe, expect, it } from "vitest";
import { locateSegments, type PageText, type PdfPage } from "./pdfGrade";

/** Pieces of text one below the other, each a line of 0.5 width and 0.02 height. */
function lines(...texts: string[]): PageText[] {
  return texts.map((str, i) => ({ str, x: 0.1, y: 0.1 + i * 0.03, width: 0.5, height: 0.02 }));
}

const page = (items: PageText[], number = 1, pdf = "a"): PdfPage => ({ pdf, page: number, items });

describe("locateSegments", () => {
  it("puts each segment where its text stands", () => {
    const { marks, found } = locateSegments(
      [page(lines("Gewerbebetrieb nach § 15", "Abs. 1 EStG"))],
      [
        { text: "Gewerbebetrieb nach § 15\n", status: "correct" },
        { text: "Abs. 1", status: "missing", note: "Du hast Abs. 2 gesagt." },
        { text: " EStG", status: "correct" },
      ],
    );
    expect(found).toBe(1);
    const boxes = marks.a[1];
    expect(boxes.map((box) => [box.segment, box.status])).toEqual([
      [0, "correct"],
      [1, "missing"],
      [2, "correct"],
    ]);
    // The first line as a whole, the second split where the segment changes ("Abs. 1" is 6 of 11 characters).
    expect(boxes[0]).toMatchObject({ x: 0.1, y: 0.1, width: 0.5 });
    expect(boxes[1].x).toBeCloseTo(0.1);
    expect(boxes[1].width).toBeCloseTo((0.5 * 6) / 11);
    expect(boxes[2].x).toBeCloseTo(0.1 + (0.5 * 7) / 11);
  });

  it("joins pieces of one line that belong to the same segment", () => {
    const items: PageText[] = [
      { str: "Die", x: 0.1, y: 0.1, width: 0.05, height: 0.02 },
      { str: " ", x: 0.15, y: 0.1, width: 0.01, height: 0.02 },
      { str: "Mitose", x: 0.16, y: 0.1, width: 0.1, height: 0.02 },
    ];
    const { marks } = locateSegments([page(items)], [{ text: "Die Mitose", status: "correct" }]);
    expect(marks.a[1]).toHaveLength(1);
    expect(marks.a[1][0].width).toBeCloseTo(0.16);
  });

  it("skips text the solution lacks, such as a header on every page", () => {
    const { marks, found } = locateSegments(
      [page(lines("Musterlösung WS 2026", "Erster Satz der Lösung.")), page(lines("Musterlösung WS 2026", "Zweiter Satz der Lösung."), 2)],
      [
        { text: "Musterlösung WS 2026\nErster Satz der Lösung.\n\n", status: "correct" },
        { text: "Zweiter Satz der Lösung.", status: "missing" },
      ],
    );
    expect(found).toBe(1);
    // On page 2 only the sentence is marked, not the repeated header.
    expect(marks.a[2]).toHaveLength(1);
    expect(marks.a[2][0]).toMatchObject({ segment: 1, y: 0.13 });
  });

  it("finds its place again after text the card has in front of the PDF text", () => {
    const { marks, found } = locateSegments(
      [page(lines("Die Lösung steht hier und ist lang genug."))],
      [
        { text: "Eigene Notiz zur Karte, die nicht in der PDF steht. ", status: "missing" },
        { text: "Die Lösung steht hier und ist lang genug.", status: "correct" },
      ],
    );
    expect(marks.a[1].map((box) => box.segment)).toEqual([1]);
    expect(found).toBeLessThan(1);
  });

  it("reads ligatures as the letters they stand for", () => {
    const { found } = locateSegments([page(lines("Pﬂicht"))], [{ text: "Pflicht", status: "correct" }]);
    expect(found).toBe(1);
  });

  it("follows the solution across several PDFs", () => {
    const { marks } = locateSegments(
      [page(lines("Teil eins."), 1, "a"), page(lines("Teil zwei."), 1, "b")],
      [
        { text: "Teil eins.\n\n", status: "correct" },
        { text: "Teil zwei.", status: "missing" },
      ],
    );
    expect(marks.a[1][0].status).toBe("correct");
    expect(marks.b[1][0].status).toBe("missing");
  });

  it("finds nothing on a scan without text", () => {
    const { marks, found } = locateSegments([page([])], [{ text: "Text aus der Texterkennung.", status: "correct" }]);
    expect(found).toBe(0);
    expect(marks).toEqual({});
  });
});
