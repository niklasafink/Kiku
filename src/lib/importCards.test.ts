import { describe, expect, it } from "vitest";
import { parseImport, parseTable, rowsFromRecords } from "./importCards";

describe("parseImport", () => {
  it("reads cells pasted from a spreadsheet, including a header and multi-line cells", () => {
    const text = 'Frage\tLösung\r\nWas ist Mitose?\tKernteilung\r\nPhasen?\t"Prophase\nMetaphase; ""Anaphase"""\r\n';
    const result = parseImport(text);
    expect(result.format).toBe("tab");
    expect(result.rows).toEqual([
      { question: "Was ist Mitose?", solution: "Kernteilung" },
      { question: "Phasen?", solution: 'Prophase\nMetaphase; "Anaphase"' },
    ]);
  });

  it("detects semicolon and comma separated files", () => {
    expect(parseImport("a;b\nc;d").format).toBe("semicolon");
    const comma = parseImport('q1,"s1, with comma"\nq2,s2');
    expect(comma.format).toBe("comma");
    expect(comma.rows[0].solution).toBe("s1, with comma");
  });

  it("falls back to blocks separated by blank lines", () => {
    const result = parseImport("Was ist Mitose?\nKernteilung, in vier Phasen\n\n\nZweite Frage\nZeile 1\nZeile 2\n");
    expect(result.format).toBe("blocks");
    expect(result.rows).toEqual([
      { question: "Was ist Mitose?", solution: "Kernteilung, in vier Phasen" },
      { question: "Zweite Frage", solution: "Zeile 1\nZeile 2" },
    ]);
  });

  it("counts incomplete rows and ignored columns", () => {
    const result = parseImport("q1\ts1\textra\nq2\t\n\ts3\nq4\ts4", "tab");
    expect(result.rows.map((r) => r.question)).toEqual(["q1", "q4"]);
    expect(result.skipped).toBe(2);
    expect(result.extraColumns).toBe(1);
  });

  it("returns nothing for empty input", () => {
    expect(parseImport("  \n ").rows).toEqual([]);
  });

  it("uses the chosen columns and reports the width of the table", () => {
    const text = "Nr\tFrage\tKapitel\tLösung\n1\tq1\tA\ts1\n2\tq2\tB\ts2";
    const result = parseImport(text, "tab", { question: 1, solution: 3 });
    expect(result.rows).toEqual([
      { question: "q1", solution: "s1" },
      { question: "q2", solution: "s2" },
    ]);
    expect(result.columns).toBe(4);
    expect(result.sample[0]).toEqual(["Nr", "Frage", "Kapitel", "Lösung"]);
  });

  it("leaves out entries that are longer than a card may be", () => {
    const result = parseImport(`q1\t${"x".repeat(20_001)}\nq2\ts2`, "tab");
    expect(result.rows).toEqual([{ question: "q2", solution: "s2" }]);
    expect(result.tooLong).toBe(1);
  });
});

describe("parseTable", () => {
  it("handles empty cells, trailing delimiters, quotes mid-field and a missing closing quote", () => {
    expect(parseTable('a;;c;\n"x";y"z\n\n;;\n"open;1\n2', ";")).toEqual([
      ["a", "", "c", ""],
      ["x", 'y"z'],
      ["open;1\n2"],
    ]);
  });

  it("reads a large table quickly", () => {
    const line = 'Frage Nummer %\t"Eine längere Lösung mit ""Zitat"", Komma und\nZeilenumbruch %"\n';
    const text = Array.from({ length: 50_000 }, (_, i) => line.replaceAll("%", String(i))).join("");
    const started = performance.now();
    const result = parseImport(text);
    const elapsed = performance.now() - started;
    expect(result.rows).toHaveLength(50_000);
    expect(result.rows[49_999].solution).toBe('Eine längere Lösung mit "Zitat", Komma und\nZeilenumbruch 49999');
    // Generous: takes well under 100 ms on a laptop; the old character-by-character parser needed seconds.
    expect(elapsed).toBeLessThan(1500);
  });
});

describe("rowsFromRecords", () => {
  it("takes spreadsheet rows and skips a header row", () => {
    const result = rowsFromRecords([
      ["Frage", "Antwort"],
      ["q1", "s1"],
      ["q2"],
    ]);
    expect(result.rows).toEqual([{ question: "q1", solution: "s1" }]);
    expect(result.skipped).toBe(1);
  });
});
