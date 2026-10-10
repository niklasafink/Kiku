// Copies a shared deck into the own library: folders, cards and pictures get new ids, so the
// copy is independent of the original and of anyone else's copy.
import { storeImage } from "./images";
import { createCards, createFolder } from "./repo";
import { IMAGE_SCHEME, imageIds } from "./richText";

export interface SharedDeck {
  name: string;
  emoji: string;
  folders: { id: string; parentId: string | null; name: string; emoji: string }[];
  cards: { id: string; folderId: string; question: string; solution: string; tags: string[] }[];
}

export async function fetchSharedDeck(token: string): Promise<SharedDeck | null> {
  const response = await fetch(`/api/share/${token}`);
  return response.ok ? ((await response.json()) as SharedDeck) : null;
}

export const sharedImageBase = (token: string) => `/api/share/${token}/images/`;

/** Returns the id of the new top folder. `onProgress` counts pictures and cards. */
export async function copySharedDeck(
  token: string,
  deck: SharedDeck,
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  const ids = [...new Set(deck.cards.flatMap((card) => [...imageIds(card.question), ...imageIds(card.solution)]))];
  const total = ids.length + deck.cards.length;
  let done = 0;

  const images = new Map<string, string>();
  for (const id of ids) {
    const response = await fetch(`${sharedImageBase(token)}${id}`).catch(() => null);
    if (response?.ok) images.set(id, await storeImage(await response.blob()));
    onProgress?.(++done, total);
  }
  const withOwnImages = (text: string) =>
    text.includes(IMAGE_SCHEME)
      ? text.replace(/!\[([^\]\n]*)\]\(kiku-img:([A-Za-z0-9-]+)\)\n?/g, (_whole, alt: string, id: string) =>
          images.has(id) ? `![${alt}](${IMAGE_SCHEME}${images.get(id)})\n` : "",
        ).trim()
      : text;

  // Parents come before their children in the list, the shared folder first.
  const folders = new Map<string, string>();
  for (const folder of deck.folders) {
    const parent = folder.parentId ? (folders.get(folder.parentId) ?? null) : null;
    folders.set(folder.id, (await createFolder(folder.name, folder.emoji, parent)).id);
  }
  for (const [oldId, newId] of folders) {
    const rows = deck.cards
      .filter((card) => card.folderId === oldId)
      .map((card) => ({ question: withOwnImages(card.question), solution: withOwnImages(card.solution), tags: card.tags }))
      .filter((card) => card.question && card.solution);
    if (rows.length > 0) await createCards(newId, rows);
    done += deck.cards.filter((card) => card.folderId === oldId).length;
    onProgress?.(done, total);
  }
  return folders.get(deck.folders[0].id)!;
}
