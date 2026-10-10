// Stores the content of an Anki package: pictures first, then decks as folders with their cards.
import { resolveAnkiImages, type AnkiPackage } from "./anki";
import { saveImage } from "./images";
import { createCards, createFolder } from "./repo";

export interface AnkiImportResult {
  cards: number;
  folders: number;
  images: number;
}

/**
 * A package with a single deck goes straight into the folder. With several decks each one
 * becomes a subfolder, nested like the deck names ("Medizin::Anatomie").
 */
export async function importAnkiPackage(
  folderId: string,
  pkg: AnkiPackage,
  onProgress: (done: number, total: number) => void,
): Promise<AnkiImportResult> {
  const cardCount = pkg.decks.reduce((sum, deck) => sum + deck.cards.length, 0);
  const total = pkg.images.length + cardCount;
  let done = 0;

  const stored = new Map<string, string>();
  for (const name of pkg.images) {
    try {
      const data = await pkg.image(name);
      if (data) stored.set(name, await saveImage(new Blob([data as BlobPart])));
    } catch {
      // A picture that cannot be read is left out; its card keeps the text.
    }
    onProgress(++done, total);
  }

  const single = pkg.decks.length === 1;
  const folders = new Map<string, string>();
  const folderFor = async (path: string[]): Promise<string> => {
    let parent = folderId;
    let key = "";
    for (const name of path) {
      key += `\x1f${name}`;
      let id = folders.get(key);
      if (!id) {
        id = (await createFolder(name.trim() || "Anki", "📁", parent)).id;
        folders.set(key, id);
      }
      parent = id;
    }
    return parent;
  };

  let cards = 0;
  for (const deck of pkg.decks) {
    const rows = deck.cards
      .map((card) => ({
        question: resolveAnkiImages(card.question, stored),
        solution: resolveAnkiImages(card.solution, stored),
      }))
      .filter((card) => card.question && card.solution);
    if (rows.length === 0) continue;
    const before = done;
    await createCards(single ? folderId : await folderFor(deck.path), rows, (stored) => onProgress(before + stored, total));
    done = before + deck.cards.length;
    cards += rows.length;
    onProgress(done, total);
  }
  return { cards, folders: folders.size, images: stored.size };
}
