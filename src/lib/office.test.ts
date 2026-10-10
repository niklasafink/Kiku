import { describe, expect, it } from "vitest";
import { readDocx, readPptx, readXlsx } from "./office";
import { zip } from "./testZip";

const encoder = new TextEncoder();

const SHEET = `<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
<row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>42</v></c></row>
<row r="3"><c r="A3" t="inlineStr"><is><t>Inline &amp; Co</t></is></c><c r="B3" t="str"><v>a&lt;b</v></c><c r="C3" t="b"><v>1</v></c></row>
<row r="4"><c r="A4"/></row>
</sheetData></worksheet>`;
const SHARED = `<sst><si><t>Frage</t></si><si><t xml:space="preserve">Lösung </t></si><si><r><t>Was ist </t></r><r><t>Mitose?</t></r><rPh><t>ignored</t></rPh></si></sst>`;

describe("readXlsx", () => {
  it.each([true, false])("reads shared, inline and plain cells and keeps empty columns (compressed: %s)", async (compress) => {
    const file = await zip({ "xl/sharedStrings.xml": SHARED, "xl/worksheets/sheet1.xml": SHEET }, compress);
    expect(await readXlsx(file)).toEqual([
      ["Frage", "Lösung "],
      ["Was ist Mitose?", "", "42"],
      ["Inline & Co", "a<b", "WAHR"],
    ]);
  });

  it("rejects files that are not spreadsheets", async () => {
    await expect(readXlsx(await zip({ "readme.txt": "x" }))).rejects.toThrow();
    await expect(readXlsx(encoder.encode("not a zip at all, just some text").buffer as ArrayBuffer)).rejects.toThrow();
  });
});

describe("readPptx and readDocx", () => {
  it("returns the text slide by slide in slide order", async () => {
    const slide = (text: string) => `<p:sld><a:p><a:r><a:t>${text}</a:t></a:r></a:p><a:p><a:r><a:t>Punkt</a:t></a:r><a:r><a:t> zwei</a:t></a:r></a:p></p:sld>`;
    const file = await zip({
      "ppt/slides/slide10.xml": slide("Zehn"),
      "ppt/slides/slide2.xml": slide("Zwei"),
      "ppt/slides/slide1.xml": slide("Eins"),
    });
    expect(await readPptx(file)).toEqual(["Eins\nPunkt zwei", "Zwei\nPunkt zwei", "Zehn\nPunkt zwei"]);
  });

  it("returns the paragraphs of a document", async () => {
    const file = await zip({
      "word/document.xml": `<w:document><w:p><w:pPr/><w:r><w:t>Erster</w:t></w:r><w:r><w:t xml:space="preserve"> Absatz</w:t></w:r></w:p><w:p></w:p><w:p><w:r><w:t>Zweiter</w:t></w:r></w:p></w:document>`,
    });
    expect(await readDocx(file)).toEqual(["Erster Absatz", "Zweiter"]);
  });
});
