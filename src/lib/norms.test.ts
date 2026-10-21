import { describe, expect, it } from "vitest";
import { checkNorms, extractCitations, markNorms, normLabel, normalizeSpoken, reportByTask, tasksOf } from "./norms";
import type { Segment } from "./types";

const labels = (text: string) => extractCitations(text).flatMap((c) => c.norms.map(normLabel));

describe("extractCitations", () => {
  it("reads paragraph, Absatz, Nummer, Satz and law", () => {
    expect(labels("Nach § 1 Abs. 1 Nr. 1 Satz 1 EStG ist steuerpflichtig.")).toEqual(["§ 1 Abs. 1 S. 1 Nr. 1 EStG"]);
  });
  it("reads abbreviated and long forms the same", () => {
    expect(labels("§ 15 Absatz 1 Satz 1 Nummer 2 EStG")).toEqual(["§ 15 Abs. 1 S. 1 Nr. 2 EStG"]);
    expect(labels("§ 15 Abs. 1 S. 1 Nr. 2 EStG")).toEqual(["§ 15 Abs. 1 S. 1 Nr. 2 EStG"]);
  });
  it("expands lists of numbers", () => {
    expect(labels("§ 15 Abs. 1 Nr. 1 und 2 EStG")).toEqual(["§ 15 Abs. 1 Nr. 1 EStG", "§ 15 Abs. 1 Nr. 2 EStG"]);
    expect(labels("§ 3 Nr. 1 bis 3 EStG")).toEqual(["§ 3 Nr. 1 EStG", "§ 3 Nr. 2 EStG", "§ 3 Nr. 3 EStG"]);
    expect(labels("§ 15 Abs. 1, 2 EStG")).toEqual(["§ 15 Abs. 1 EStG", "§ 15 Abs. 2 EStG"]);
  });
  it("reads several paragraphs of one law", () => {
    expect(labels("§§ 15, 16 und 17 EStG")).toEqual(["§ 15 EStG", "§ 16 EStG", "§ 17 EStG"]);
  });
  it("reads paragraphs with a letter, roman Absatz, Buchstabe and the law behind des", () => {
    expect(labels("§ 8b Abs. 2 KStG")).toEqual(["§ 8b Abs. 2 KStG"]);
    expect(labels("§ 15 I Nr. 1 EStG")).toEqual(["§ 15 Abs. 1 Nr. 1 EStG"]);
    expect(labels("§ 7 Abs. 1 Nr. 2 Buchst. a des EStG")).toEqual(["§ 7 Abs. 1 Nr. 2 Buchst. a EStG"]);
  });
  it("lets a citation without a law take the law of the next one", () => {
    expect(labels("§ 15 Abs. 1 und § 16 EStG")).toEqual(["§ 15 Abs. 1 EStG", "§ 16 EStG"]);
    expect(labels("§ 3 Nr. 40 EStG i. V. m. § 8b KStG")).toEqual(["§ 3 Nr. 40 EStG", "§ 8b KStG"]);
  });
  it("reads articles and handbook references", () => {
    expect(labels("Art. 3 Abs. 1 GG")).toEqual(["Art. 3 Abs. 1 GG"]);
    expect(labels("siehe R 8.5 KStR und H 4.2 EStH")).toEqual(["R 8.5 KStR", "H 4.2 EStH"]);
  });
  it("does not take a word for a law", () => {
    expect(labels("§ 15 Abs. 1 Nr. 2 sagt etwas. Der BFH meint § 16 BFH-Urteil")).toEqual(["§ 15 Abs. 1 Nr. 2", "§ 16"]);
  });
});

describe("normalizeSpoken", () => {
  it("turns spoken numbers behind keywords into digits", () => {
    expect(labels(normalizeSpoken("Paragraf fünfzehn Absatz eins Nummer zwei EStG"))).toEqual(["§ 15 Abs. 1 Nr. 2 EStG"]);
    expect(normalizeSpoken("Paragraph einundzwanzig")).toBe("Paragraph 21");
  });
});

describe("checkNorms", () => {
  const solution = "Aufgabe 1\nGewerbebetrieb nach § 15 Abs. 2 EStG. Gewinn nach § 4 Abs. 1 S. 1 EStG.";
  it("marks named, partly named and missing norms", () => {
    const checks = checkNorms(solution, "Es liegt ein Gewerbebetrieb nach § 15 Abs. 2 EStG vor, der Gewinn folgt aus § 4.");
    expect(checks.map((c) => [c.label, c.status])).toEqual([
      ["§ 15 Abs. 2 EStG", "named"],
      ["§ 4 Abs. 1 S. 1 EStG", "partial"],
    ]);
    expect(checks[1].note).toBe("Nur § 4 genannt, es fehlt Abs. 1, S. 1.");
  });
  it("names the other Absatz that was cited instead", () => {
    const [check] = checkNorms("§ 15 Abs. 1 EStG", "§ 15 Abs. 2 EStG");
    expect(check.status).toBe("missing");
    expect(check.note).toContain("§ 15 Abs. 2 EStG");
  });
  it("counts a more specific citation and a missing law as named", () => {
    expect(checkNorms("§ 15 EStG", "§ 15 Abs. 2 Nr. 1")[0].status).toBe("named");
  });
  it("reads a list in the answer", () => {
    expect(checkNorms("§ 15 Abs. 2 EStG", "§ 15 Abs. 1 und 2 EStG")[0].status).toBe("named");
  });
  it("tells a different law apart", () => {
    expect(checkNorms("§ 8 KStG", "§ 8 EStG")[0].status).toBe("missing");
  });
  it("groups norms under the task heading", () => {
    expect(checkNorms(solution, "")[0].task).toBe("Aufgabe 1");
  });
});

describe("tasks", () => {
  it("finds task headings", () => {
    const text = "Aufgabe 1\nA\n\n**Aufgabe 2**\nB\n## Teil II\nC";
    expect(tasksOf(text).map((t) => t.label)).toEqual(["Aufgabe 1", "Aufgabe 2", "Teil II"]);
  });
});

describe("markNorms", () => {
  const segments: Segment[] = [
    { text: "Aufgabe 1\nGewerbebetrieb nach § 15 Abs. 2 EStG.\n", status: "correct" },
    { text: "Aufgabe 2\nZinsen nach § 20 Abs. 1 Nr. 7 EStG.", status: "missing" },
  ];
  it("cuts a missing norm out of a correct segment and keeps the text whole", () => {
    const { segments: out, checks } = markNorms(segments, "Gewerbebetrieb liegt vor.");
    expect(out.map((s) => s.text).join("")).toBe(segments.map((s) => s.text).join(""));
    const cut = out.find((s) => s.text === "§ 15 Abs. 2 EStG");
    expect(cut?.status).toBe("missing");
    expect(cut?.note).toMatch(/Norm nicht genannt/);
    expect(checks).toHaveLength(2);
  });
  it("leaves everything alone when all norms are named", () => {
    const { segments: out } = markNorms(segments, "§ 15 Abs. 2 EStG und § 20 Abs. 1 Nr. 7 EStG");
    expect(out).toEqual(segments);
  });
  it("lowers the score for a missing norm", () => {
    const named = markNorms(segments, "§ 15 Abs. 2 EStG").score;
    const unnamed = markNorms(segments, "nichts").score;
    expect(unnamed).toBeLessThan(named);
  });
  it("reports tasks that were not worked on", () => {
    const { segments: out, checks } = markNorms(segments, "§ 15 Abs. 2 EStG");
    const report = reportByTask(out, checks);
    expect(report.map((t) => [t.label, t.untouched])).toEqual([
      ["Aufgabe 1", false],
      ["Aufgabe 2", true],
    ]);
  });
});
