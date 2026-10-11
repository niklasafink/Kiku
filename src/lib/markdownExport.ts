// The library as one Markdown document: a backup anyone can read in any editor, without this
// app and without a network. It is made for reading, the import does not take it back.
import { IMAGE_SCHEME, imageExtension, imageIds } from "./richText";
import { pathTo } from "./tree";
import type { Card, Folder, StoredImage } from "./types";
import { writeZip, type ZipFile } from "./zipWrite";

const IMAGE_MARKUP = new RegExp(`!\\[([^\\]\\n]*)\\]\\(${IMAGE_SCHEME}([A-Za-z0-9-]+)\\)`, "g");
const IMAGE_FOLDER = "bilder";
const MISSING_IMAGE = "*(Bild nicht verfügbar)*";

/**
 * Folders become headings with their full path, sorted by it; below each its cards in the order
 * they were written. `imagePath` gives the file a picture was saved as; without one the picture
 * is named as missing.
 */
export function cardsToMarkdown(
  cards: Card[],
  folders: Folder[],
  imagePath: (id: string) => string | null = () => null,
  now = new Date(),
): string {
  const text = (value: string) =>
    value
      .replace(IMAGE_MARKUP, (_whole, alt: string, id: string) => {
        const path = imagePath(id);
        return path ? `![${alt}](${path})` : MISSING_IMAGE;
      })
      .trim();

  const groups = new Map<string, Card[]>();
  for (const card of [...cards].sort((a, b) => a.createdAt - b.createdAt)) {
    const path = pathTo(folders, card.folderId);
    const title = path.length > 0 ? `${path[0].emoji} ${path.map((f) => f.name).join(" / ")}` : "Ohne Ordner";
    groups.set(title, [...(groups.get(title) ?? []), card]);
  }

  const date = now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const lines = ["# Kiku-Karteikarten", "", `Stand: ${date}, ${cards.length === 1 ? "1 Karte" : `${cards.length} Karten`}`];
  for (const [title, group] of [...groups].sort(([a], [b]) => a.localeCompare(b, "de"))) {
    lines.push("", `## ${title}`);
    group.forEach((card, index) => {
      lines.push("", `### Frage ${index + 1}`, "", text(card.question), "", "**Lösung**", "", text(card.solution));
      if (card.tags?.length) lines.push("", `Tags: ${card.tags.join(", ")}`);
      lines.push("", "---");
    });
  }
  return `${lines.join("\n")}\n`;
}

/**
 * The file to download: the Markdown document alone, or, once a card has a picture, a ZIP
 * archive with the document and the pictures next to it, so the document shows them.
 */
export async function buildMarkdownBackup(
  cards: Card[],
  folders: Folder[],
  image: (id: string) => Promise<Pick<StoredImage, "type" | "data"> | null>,
  now = new Date(),
): Promise<{ extension: "md" | "zip"; content: Blob }> {
  const files: ZipFile[] = [];
  const paths = new Map<string, string>();
  for (const id of new Set(cards.flatMap((card) => imageIds(`${card.question}\n${card.solution}`)))) {
    const found = await image(id);
    if (!found) continue;
    const path = `${IMAGE_FOLDER}/${id}.${imageExtension(found.type)}`;
    paths.set(id, path);
    files.push({ name: path, data: new Uint8Array(found.data), store: true });
  }
  const markdown = cardsToMarkdown(cards, folders, (id) => paths.get(id) ?? null, now);
  if (files.length === 0) return { extension: "md", content: new Blob([markdown], { type: "text/markdown;charset=utf-8" }) };
  return { extension: "zip", content: await writeZip([{ name: "karten.md", data: new TextEncoder().encode(markdown) }, ...files], now) };
}
