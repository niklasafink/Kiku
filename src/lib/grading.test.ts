import { describe, expect, it } from "vitest";
import { createPainter, scoreSegments, segmentsFromIssues, splitSentences } from "./grading";

describe("segmentsFromIssues", () => {
  const sections = ["Nach § 8 Abs. 3 S. 2 KStG mindert die vGA das Einkommen nicht. ", "Sie wird außerbilanziell hinzugerechnet.\n", "Wert: gemeiner Wert."];

  it("marks everything the model did not name as correct", () => {
    expect(segmentsFromIssues(sections, [])).toEqual([{ text: sections.join(""), status: "correct" }]);
  });

  it("cuts out a single wrong detail and keeps the rest of the section correct", () => {
    const result = segmentsFromIssues(sections, [{ index: 0, text: "Abs. 3", status: "missing", note: "Du hast Abs. 2 gesagt." }]);
    expect(result.map((s) => s.text).join("")).toBe(sections.join(""));
    expect(result.map((s) => [s.text, s.status])).toEqual([
      ["Nach § 8 ", "correct"],
      ["Abs. 3", "missing"],
      [" S. 2 KStG mindert die vGA das Einkommen nicht. Sie wird außerbilanziell hinzugerechnet.\nWert: gemeiner Wert.", "correct"],
    ]);
    expect(result[1].note).toBe("Du hast Abs. 2 gesagt.");
  });

  it("marks the whole section when the part is empty or cannot be found", () => {
    const result = segmentsFromIssues(sections, [
      { index: 1, text: "", status: "missing", note: "" },
      { index: 2, text: "Teilwert", status: "unsure", note: "" },
    ]);
    expect(result.map((s) => s.status)).toEqual(["correct", "missing", "unsure"]);
    expect(result[1].text).toBe(sections[1]);
    expect(result[1].note).toBeUndefined();
  });

  it("tolerates whitespace and case and ignores indices outside the solution", () => {
    const result = segmentsFromIssues(sections, [
      { index: 2, text: "Gemeiner   wert", status: "missing", note: "" },
      { index: 7, text: "", status: "missing", note: "" },
    ]);
    expect(result.map((s) => [s.text, s.status]).slice(-1)).toEqual([["gemeiner Wert.", "missing"]]);
    expect(result.map((s) => s.text).join("")).toBe(sections.join(""));
  });
});

describe("splitSentences", () => {
  it("reproduces the text exactly", () => {
    for (const text of [
      "Ein Satz. Noch einer! Und ein dritter?",
      "- Punkt eins\n- Punkt zwei\n\n- Punkt drei",
      "Ohne Satzzeichen",
      "Ende mit Leerraum.  \n",
      "...\nText danach",
    ]) {
      expect(splitSentences(text).join("")).toBe(text);
    }
  });

  it("splits at sentence ends and line breaks", () => {
    expect(splitSentences("Eins. Zwei.\nDrei")).toEqual(["Eins. ", "Zwei.\n", "Drei"]);
  });

  it("does not cut after abbreviations and list numbers", () => {
    expect(splitSentences("Nach § 3 Nr. 40 S. 1 Buchst. d EStG gilt das, i. V. m. § 3c EStG. 1. Punkt")).toEqual([
      "Nach § 3 Nr. 40 S. 1 Buchst. d EStG gilt das, i. V. m. § 3c EStG. ",
      "1. Punkt",
    ]);
  });
});

describe("scoreSegments", () => {
  it("is the share of correct non-whitespace characters", () => {
    expect(
      scoreSegments([
        { text: "abcd ", status: "correct" },
        { text: "ef", status: "missing" },
        { text: " gh", status: "unsure" },
      ]),
    ).toBe(50);
    expect(scoreSegments([])).toBe(0);
  });
});

describe("createPainter", () => {
  it("assigns the shown text to the segments, in reading order", () => {
    const paint = createPainter([
      { text: "Gewerbebetrieb nach § 15 ", status: "correct" },
      { text: "Abs. 1", status: "missing" },
      { text: " EStG", status: "correct" },
    ]);
    // Shown as "Gewerbebetrieb nach **§ 15 Abs. 1** EStG": three pieces of text.
    expect(paint("Gewerbebetrieb nach ")).toEqual([{ text: "Gewerbebetrieb nach ", segment: 0 }]);
    expect(paint("§ 15 Abs. 1")).toEqual([
      { text: "§ 15 ", segment: 0 },
      { text: "Abs. 1", segment: 1 },
    ]);
    expect(paint(" EStG")).toEqual([{ text: " EStG", segment: 2 }]);
  });

  it("skips what only the plain text has: list markers and table dividers", () => {
    const paint = createPainter([
      { text: "- Prophase\n", status: "correct" },
      { text: "- Metaphase\n", status: "missing" },
      { text: "Phase | Dauer", status: "correct" },
    ]);
    expect(paint("Prophase")).toEqual([{ text: "Prophase", segment: 0 }]);
    expect(paint("Metaphase")).toEqual([{ text: "Metaphase", segment: 1 }]);
    expect(paint("Phase")).toEqual([{ text: "Phase", segment: 2 }]);
    expect(paint("Dauer")).toEqual([{ text: "Dauer", segment: 2 }]);
  });
});
