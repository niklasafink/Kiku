// Sharing a folder by link: anyone with the link can read the folder as it is right now,
// including its subfolders, and copy it into their own library.
import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { imageIds } from "@/lib/richText";
import { descendantIds } from "@/lib/tree";
import type { Database } from "./db";
import { getImage } from "./images";
import { cards, folders, shares } from "./schema";

/** Unguessable and safe in a URL. */
const newToken = () => randomBytes(18).toString("base64url");

export const isShareToken = (token: string) => /^[A-Za-z0-9_-]{20,40}$/.test(token);

/** The link of a folder, if it is shared. */
export async function shareOf(db: Database, userId: string, folderId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: shares.id })
    .from(shares)
    .where(and(eq(shares.userId, userId), eq(shares.folderId, folderId)));
  return row?.id ?? null;
}

/** Shares the folder and returns its token; a folder that is shared already keeps its link. */
export async function createShare(db: Database, userId: string, folderId: string): Promise<string | null> {
  const [folder] = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.userId, userId), eq(folders.id, folderId), isNull(folders.deletedAt)));
  if (!folder) return null;
  const existing = await shareOf(db, userId, folderId);
  if (existing) return existing;
  const id = newToken();
  await db.insert(shares).values({ id, userId, folderId, createdAt: Date.now() });
  return id;
}

export async function deleteShare(db: Database, userId: string, folderId: string): Promise<void> {
  await db.delete(shares).where(and(eq(shares.userId, userId), eq(shares.folderId, folderId)));
}

export interface SharedDeck {
  name: string;
  emoji: string;
  /** The shared folder first, then its subfolders. parentId is null for the shared folder itself. */
  folders: { id: string; parentId: string | null; name: string; emoji: string }[];
  cards: { id: string; folderId: string; question: string; solution: string; tags: string[] }[];
}

async function sharedFolders(db: Database, token: string) {
  if (!isShareToken(token)) return null;
  const [share] = await db.select().from(shares).where(eq(shares.id, token));
  if (!share) return null;
  const all = await db
    .select({ id: folders.id, parentId: folders.parentId, name: folders.name, emoji: folders.emoji, createdAt: folders.createdAt })
    .from(folders)
    .where(and(eq(folders.userId, share.userId), isNull(folders.deletedAt)));
  const root = all.find((folder) => folder.id === share.folderId);
  if (!root) return null; // the folder was deleted after sharing
  const ids = descendantIds(all, root.id);
  return { share, root, ids, folders: ids.map((id) => all.find((folder) => folder.id === id)!) };
}

/** Name of a shared deck for the page title and link previews, or null if the link does not exist (any more). */
export async function sharedDeckName(db: Database, token: string): Promise<{ name: string; emoji: string } | null> {
  const found = await sharedFolders(db, token);
  return found && { name: found.root.name, emoji: found.root.emoji };
}

/** What the link shows, or null if it does not exist (any more). The star and other personal marks stay private. */
export async function getSharedDeck(db: Database, token: string): Promise<SharedDeck | null> {
  const found = await sharedFolders(db, token);
  if (!found) return null;
  const rows = await db
    .select({ id: cards.id, folderId: cards.folderId, question: cards.question, solution: cards.solution, tags: cards.tags })
    .from(cards)
    .where(and(eq(cards.userId, found.share.userId), isNull(cards.deletedAt), inArray(cards.folderId, found.ids)))
    .orderBy(asc(cards.createdAt));
  return {
    name: found.root.name,
    emoji: found.root.emoji,
    folders: found.folders.map((folder) => ({
      id: folder.id,
      parentId: folder.id === found.root.id ? null : folder.parentId,
      name: folder.name,
      emoji: folder.emoji,
    })),
    cards: rows.map((row) => ({ ...row, tags: row.tags.filter((tag) => tag !== "★") })),
  };
}

/** A picture of a shared deck. Only pictures that one of its cards shows can be fetched through the link. */
export async function getSharedImage(db: Database, token: string, imageId: string) {
  const deck = await getSharedDeck(db, token);
  if (!deck) return null;
  const used = deck.cards.some((card) => imageIds(card.question).includes(imageId) || imageIds(card.solution).includes(imageId));
  if (!used) return null;
  const [share] = await db.select({ userId: shares.userId }).from(shares).where(eq(shares.id, token));
  return share ? getImage(db, share.userId, imageId) : null;
}
