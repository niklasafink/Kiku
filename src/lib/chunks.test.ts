import { describe, expect, it } from "vitest";
import { chunkPages } from "./chunks";

describe("chunkPages", () => {
  it("keeps pages whole and fills each piece up to the limit", () => {
    expect(chunkPages(["aaaa", "bbbb", "cccc"], 10)).toEqual(["aaaa\n\nbbbb", "cccc"]);
  });

  it("cuts a page that is longer than the limit at a break and loses nothing", () => {
    const page = `${"wort ".repeat(30).trim()}\n\n${"satz ".repeat(30).trim()}`;
    const chunks = chunkPages([page], 100);
    expect(chunks.every((chunk) => chunk.length <= 100)).toBe(true);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(page.replace(/\s+/g, " "));
  });

  it("returns nothing for empty material", () => {
    expect(chunkPages(["", "  \n "])).toEqual([]);
  });
});
