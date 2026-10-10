import { describe, expect, it } from "vitest";
import { htmlToMarkdown, markdownToHtml } from "./html";
import { parseBlocks } from "./richText";

describe("htmlToMarkdown", () => {
  it("leaves plain text alone apart from entities", () => {
    expect(htmlToMarkdown("Mitose &amp; Meiose &lt;3 &#228;&nbsp;x")).toBe("Mitose & Meiose <3 ä x");
  });

  it("turns line breaks and blocks into lines", () => {
    expect(htmlToMarkdown("Zeile 1<br>Zeile 2<div>Zeile 3</div><div><br></div><p>Absatz</p>Ende")).toBe(
      "Zeile 1\nZeile 2\nZeile 3\n\nAbsatz\n\nEnde",
    );
  });

  it("keeps bold, italic, marks and code, with the markers touching the text", () => {
    expect(htmlToMarkdown('Die <b>Mitose </b>hat <i>vier</i> <strong><em>Phasen</em></strong>, <mark>wichtig</mark> <code>x</code>.')).toBe(
      "Die **Mitose** hat *vier* ***Phasen***, ==wichtig== `x`.",
    );
    expect(htmlToMarkdown("<b>eins<br>zwei</b>")).toBe("**eins**\n**zwei**");
    expect(htmlToMarkdown("a<b> </b>b")).toBe("a b");
  });

  it("drops what has no counterpart but keeps its text", () => {
    expect(htmlToMarkdown('<span style="color: red">rot</span> <u>unter</u><style>.x{}</style><!-- c --> [sound:a.mp3]<font size=2>klein</font>')).toBe(
      "rot unter klein",
    );
  });

  it("reads lists, nested and numbered", () => {
    expect(htmlToMarkdown("Phasen:<ul><li>Pro</li><li>Meta<ul><li>innen</li></ul></li></ul><ol><li>eins</li><li>zwei</li></ol>")).toBe(
      "Phasen:\n- Pro\n- Meta\n  - innen\n1. eins\n2. zwei",
    );
  });

  it("reads tables into something the card renderer shows as a table", () => {
    const markdown = htmlToMarkdown("<table><tr><th>Phase</th><th>Was</th></tr><tr><td>Pro</td><td><b>kondensiert</b></td></tr></table>danach");
    const blocks = parseBlocks(markdown);
    expect(blocks.map((b) => b.type)).toEqual(["table", "paragraph"]);
    expect(markdown).toContain("| Pro | **kondensiert** |");
  });

  it("asks for each picture and puts the answer in its place", () => {
    const seen: string[] = [];
    const markdown = htmlToMarkdown('vor <img src="zelle%201.png" alt="x"> nach <img src=\'b.jpg\'/>', (src) => {
      seen.push(src);
      return `[${src}]`;
    });
    expect(seen).toEqual(["zelle%201.png", "b.jpg"]);
    expect(markdown).toBe("vor [zelle%201.png] nach [b.jpg]");
    expect(htmlToMarkdown('a<img src="x.png">b')).toBe("ab");
  });

  it("survives broken markup", () => {
    expect(htmlToMarkdown("<b>offen <i>beides")).toBe("offen beides");
    expect(htmlToMarkdown("zu</b> viel</div>")).toBe("zu viel");
    expect(htmlToMarkdown("a < b und c > d")).toBe("a < b und c > d");
  });
});

describe("markdownToHtml", () => {
  it("writes HTML that reads back as the same card text", () => {
    const text = "Die **Mitose** hat *vier* ==Phasen== mit `x < y`:\nzweite Zeile\n\n- Pro\n- Meta\n\n1. eins\n2. zwei\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nEnde & aus";
    const html = markdownToHtml(text);
    expect(html).not.toContain("\n");
    // Blank lines around lists may differ; what the card shows is the same.
    expect(parseBlocks(htmlToMarkdown(html))).toEqual(parseBlocks(text));
  });

  it("leaves pictures out", () => {
    expect(markdownToHtml("Text\n\n![](kiku-img:abc-1)")).toBe("Text");
  });
});

describe("formulas in HTML", () => {
  it("reads MathJax notation as Anki writes it and writes it back", () => {
    const markdown = htmlToMarkdown("Es gilt \\(E = mc^2\\).<br>\\[ \\frac{a}{b} \\]");
    expect(markdown).toBe("Es gilt $E = mc^2$.\n$$\\frac{a}{b}$$");
    expect(markdownToHtml("Es gilt $a < b$.\n\n$$\nx^2\n$$")).toBe("Es gilt \\(a &lt; b\\).<br><br>\\[x^2\\]");
  });
});
