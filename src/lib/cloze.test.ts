import { describe, expect, it } from "vitest";
import { clozeCards, markGap, parseCloze } from "./cloze";

describe("cloze", () => {
  it("makes one card per gap, blanking only that gap", () => {
    expect(clozeCards("Die Hauptstadt von [[Frankreich]] ist [[Paris]].")).toEqual([
      { question: "Die Hauptstadt von ______ ist Paris.", solution: "Frankreich" },
      { question: "Die Hauptstadt von Frankreich ist ______.", solution: "Paris" },
    ]);
  });

  it("understands Anki's syntax, groups gaps by number and shows hints", () => {
    const cards = clozeCards("{{c1::Mitochondrien}} erzeugen {{c2::ATP::Molekül}}; {{c1::Chloroplasten}} nicht.");
    expect(cards).toEqual([
      { question: "______ erzeugen ATP; ______ nicht.", solution: "Mitochondrien\nChloroplasten" },
      { question: "Mitochondrien erzeugen ______ (Molekül); Chloroplasten nicht.", solution: "ATP" },
    ]);
  });

  it("can put every gap on one card", () => {
    expect(clozeCards("[[a]] und [[b::Hinweis]]", { single: true })).toEqual([
      { question: "______ und ______ (Hinweis)", solution: "a\nb" },
    ]);
  });

  it("leaves text without gaps and empty gaps alone", () => {
    expect(clozeCards("Kein Lückentext.")).toEqual([]);
    expect(parseCloze("Leer [[ ]] hier")).toEqual(["Leer ", "[[ ]]", " hier"]);
    expect(parseCloze("Zeilen [[über\nzwei]] Zeilen")).toEqual(["Zeilen ", { text: "über\nzwei", group: 1001 }, " Zeilen"]);
  });

  it("wraps a selection as a gap, keeping spaces outside", () => {
    expect(markGap("ein Wort hier", 3, 9)).toEqual({ text: "ein [[Wort]] hier", cursor: 12 });
    expect(markGap("ab", 1, 1)).toEqual({ text: "a[[]]b", cursor: 3 });
  });
});
