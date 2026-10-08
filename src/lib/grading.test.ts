import { describe, expect, it } from "vitest";
import { alignSegments, scoreSegments, splitSentences } from "./grading";

describe("alignSegments", () => {
  const solution = "Die Mitose besteht aus vier Phasen:\n- Prophase\n- Metaphase";

  it("maps segments back onto the original text, keeping whitespace and punctuation", () => {
    const result = alignSegments(solution, [
      { text: "Die Mitose besteht aus vier Phasen", status: "correct", note: "genannt" },
      { text: "Prophase", status: "missing", note: "" },
      { text: "Metaphase", status: "unsure", note: "nur angedeutet" },
    ]);
    expect(result).not.toBeNull();
    expect(result!.map((s) => s.text).join("")).toBe(solution);
    expect(result!.map((s) => s.status)).toEqual(["correct", "missing", "unsure"]);
    expect(result![1].note).toBeUndefined();
  });

  it("tolerates whitespace differences", () => {
    const result = alignSegments("Erster  Teil,\nzweiter Teil.", [
      { text: "Erster Teil,", status: "correct" },
      { text: "zweiter   Teil.", status: "missing" },
    ]);
    expect(result!.map((s) => s.text).join("")).toBe("Erster  Teil,\nzweiter Teil.");
  });

  it("rejects segments that skip content", () => {
    expect(
      alignSegments(solution, [
        { text: "Die Mitose besteht aus vier Phasen", status: "correct" },
        { text: "Metaphase", status: "missing" },
      ]),
    ).toBeNull();
  });

  it("rejects rewritten text and a missing tail", () => {
    expect(alignSegments(solution, [{ text: "Mitose hat vier Phasen", status: "correct" }])).toBeNull();
    expect(
      alignSegments(solution, [{ text: "Die Mitose besteht aus vier Phasen", status: "correct" }]),
    ).toBeNull();
  });

  it("handles regex special characters in the solution", () => {
    const text = "f(x) = x^2 + 1 (Parabel). Kosten: 5 $?";
    const result = alignSegments(text, [
      { text: "f(x) = x^2 + 1 (Parabel).", status: "correct" },
      { text: "Kosten: 5 $?", status: "missing" },
    ]);
    expect(result!.map((s) => s.text).join("")).toBe(text);
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
