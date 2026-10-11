import { describe, expect, it } from "vitest";
import { buildMarkdownBackup, cardsToMarkdown } from "./markdownExport";
import { openZip } from "./zip";
import type { Card, Folder } from "./types";

const folders: Folder[] = [
  { id: "bio", parentId: null, name: "Biologie", emoji: "🧬", createdAt: 0 },
  { id: "cell", parentId: "bio", name: "Zelle", emoji: "📁", createdAt: 0 },
];
const card = (id: string, folderId: string, question: string, solution: string, createdAt: number, tags?: string[]): Card => ({
  id,
  folderId,
  question,
  solution,
  tags,
  createdAt,
  updatedAt: createdAt,
});
const now = new Date(2026, 9, 11);

describe("cardsToMarkdown", () => {
  it("groups the cards by folder path and keeps their text and tags", () => {
    const cards = [
      card("3", "cell", "Mitose?", "Kernteilung\n\n- Pro\n- Meta", 3, ["klausur"]),
      card("2", "bio", "Zweite?", "b", 2),
      card("1", "bio", "Erste?", "**a**", 1),
    ];
    expect(cardsToMarkdown(cards, folders, undefined, now)).toBe(
      [
        "# Kiku-Karteikarten",
        "",
        "Stand: 11.10.2026, 3 Karten",
        "",
        "## 🧬 Biologie",
        "",
        "### Frage 1",
        "",
        "Erste?",
        "",
        "**Lösung**",
        "",
        "**a**",
        "",
        "---",
        "",
        "### Frage 2",
        "",
        "Zweite?",
        "",
        "**Lösung**",
        "",
        "b",
        "",
        "---",
        "",
        "## 🧬 Biologie / Zelle",
        "",
        "### Frage 1",
        "",
        "Mitose?",
        "",
        "**Lösung**",
        "",
        "Kernteilung\n\n- Pro\n- Meta",
        "",
        "Tags: klausur",
        "",
        "---",
        "",
      ].join("\n"),
    );
  });

  it("keeps cards whose folder is gone", () => {
    expect(cardsToMarkdown([card("1", "lost", "Frage?", "Antwort", 1)], folders, undefined, now)).toContain("## Ohne Ordner\n\n### Frage 1\n\nFrage?");
  });
});

describe("buildMarkdownBackup", () => {
  it("is a plain Markdown file while no card has a picture", async () => {
    const backup = await buildMarkdownBackup([card("1", "bio", "Frage?", "Antwort", 1)], folders, async () => null, now);
    expect(backup.extension).toBe("md");
    expect(await backup.content.text()).toContain("### Frage 1\n\nFrage?");
  });

  it("packs pictures next to the document and points the cards at them", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const cards = [card("1", "bio", "Aufbau?\n\n![](kiku-img:abc-1)", "Kern ![alt](kiku-img:gone-2)", 1)];
    const backup = await buildMarkdownBackup(cards, folders, async (id) => (id === "abc-1" ? { type: "image/jpeg", data: bytes.buffer } : null), now);
    expect(backup.extension).toBe("zip");
    const zip = openZip(await backup.content.arrayBuffer());
    expect(zip.names).toEqual(["karten.md", "bilder/abc-1.jpg"]);
    expect([...(await zip.bytes("bilder/abc-1.jpg"))!]).toEqual([...bytes]);
    const markdown = (await zip.text("karten.md"))!;
    expect(markdown).toContain("Aufbau?\n\n![](bilder/abc-1.jpg)");
    expect(markdown).toContain("Kern *(Bild nicht verfügbar)*");
  });
});
