import { describe, expect, it } from "vitest";
import { parseImport } from "./importCards";

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
});
