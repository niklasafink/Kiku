import { describe, expect, it } from "vitest";
import { editorHtmlToMarkdown, markdownToEditorHtml } from "./editorHtml";
import { parseBlocks } from "./richText";

const roundTrip = (text: string) => editorHtmlToMarkdown(markdownToEditorHtml(text, (id) => `blob:${id}`));

describe("editor HTML", () => {
  it.each([
    "Einfacher Text\nmit zweiter Zeile\n\nund neuem Absatz",
    "Die **Mitose** hat *vier* ==Phasen== mit `code`.",
    "## Titel\n\nText\n\n### Unterpunkt",
    "- eins\n- zwei\n  - innen\n  - noch eins\n- drei",
    "3. drei\n4. vier",
    "| A | B |\n| --- | --- |\n| 1 | **2** |\n| x \\| y | z |",
    "Formel $E = mc^2$ im Satz, 5 < 6 & \"so\".\n\n$$\\frac{a}{b}$$",
    "Vorher\n\n![](kiku-img:abc-123)\n\nNachher",
    "Text\n- Liste direkt danach\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nEnde",
  ])("keeps what the card shows: %s", (text) => {
    expect(parseBlocks(roundTrip(text))).toEqual(parseBlocks(text));
  });

  it.each([
    ["$E = mc^2$", false, "E = mc^2"],
    ["$$\\frac{a}{b}$$", true, "\\frac{a}{b}"],
    ['$a < b \\;\\&\\; "q" \\neq \'r\'$', false, 'a < b \\;\\&\\; "q" \\neq \'r\''],
    ["$$\\left\\{ x \\mid x < 1 \\land x > 0 \\right\\}$$", true, "\\left\\{ x \\mid x < 1 \\land x > 0 \\right\\}"],
  ])("shows %s as a formula element and reads it back unchanged", (text, display, tex) => {
    const html = markdownToEditorHtml(`Vor ${text} nach`, () => "");
    expect(html).toBe(`<p>Vor <span data-kiku-math="${tex.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")}" data-display="${display}"></span> nach</p>`);
    expect(editorHtmlToMarkdown(html)).toBe(`Vor ${text} nach`);
    expect(roundTrip(text)).toBe(text);
  });

  it("reads the formula element the way the editor writes it", () => {
    // Tiptap serialises attributes with entities and in its own order; a display formula sits in a paragraph of its own.
    expect(editorHtmlToMarkdown('<p>Es gilt <span data-display="false" data-kiku-math="a &lt; b &amp;&amp; &quot;c&quot;"></span>.</p>')).toBe('Es gilt $a < b && "c"$.');
    expect(parseBlocks(editorHtmlToMarkdown('<p>Text</p><p><span data-kiku-math="\\sum_{i=1}^n i" data-display="true"></span></p>'))).toEqual(parseBlocks("Text\n\n$$\\sum_{i=1}^n i$$"));
  });

  it("writes plain text back exactly", () => {
    const text = "Was ist die Mitose?\nZweite Zeile\n\nNeuer Absatz";
    expect(roundTrip(text)).toBe(text);
  });

  it("reads what the editor produces for lists and tables", () => {
    const html =
      '<p>Text</p><ul><li><p>eins</p></li><li><p>zwei</p><ul><li><p>innen</p></li></ul></li></ul><ol start="3"><li><p>drei</p></li></ol>' +
      '<table style="min-width: 50px"><colgroup><col><col></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>A</p></th><th colspan="1" rowspan="1"><p>B</p></th></tr><tr><td colspan="1" rowspan="1"><p>1</p></td><td colspan="1" rowspan="1"><p></p></td></tr></tbody></table><p></p>';
    expect(editorHtmlToMarkdown(html)).toBe("Text\n\n- eins\n- zwei\n  - innen\n3. drei\n\n| A | B |\n| --- | --- |\n| 1 |  |");
  });

  it("keeps a picture by its id, not by its temporary address", () => {
    expect(editorHtmlToMarkdown('<p>a</p><img src="blob:http://x/1" data-kiku-id="img-0001"><p>b</p>')).toBe("a\n\n![](kiku-img:img-0001)\n\nb");
    expect(editorHtmlToMarkdown('<img src="https://example.com/x.png">')).toBe("");
  });
});
