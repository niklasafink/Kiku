// Single entry point for all persistence. Everything is local (IndexedDB) for now;
// a server database or sync layer can later be added behind these functions.
import { z } from "zod";
import { db } from "./db";
import { descendantIds } from "./tree";
import type { Attempt, Card, Folder, SavedSession } from "./types";

export function newId(): string {
  // crypto.randomUUID only exists in secure contexts (https / localhost).
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function createFolder(name: string, emoji: string, parentId: string | null): Promise<Folder> {
  const folder: Folder = { id: newId(), parentId, name: name.trim(), emoji, createdAt: Date.now() };
  await db.folders.add(folder);
  return folder;
}

export async function updateFolder(id: string, patch: Pick<Folder, "name" | "emoji">): Promise<void> {
  await db.folders.update(id, { name: patch.name.trim(), emoji: patch.emoji });
}

/** Moves the folder with everything in it. A folder cannot be moved into itself or its own subfolders. */
export async function moveFolder(id: string, parentId: string | null): Promise<void> {
  await db.transaction("rw", db.folders, async () => {
    const folders = await db.folders.toArray();
    if (parentId !== null) {
      if (!folders.some((f) => f.id === parentId)) throw new Error("Der Zielordner existiert nicht mehr.");
      if (descendantIds(folders, id).includes(parentId)) {
        throw new Error("Ein Ordner kann nicht in sich selbst verschoben werden.");
      }
    }
    await db.folders.update(id, { parentId });
  });
}

/** Deletes the folder, all nested folders, their cards and those cards' attempts. */
export async function deleteFolderRecursive(id: string): Promise<void> {
  await db.transaction("rw", db.folders, db.cards, db.attempts, db.sessions, async () => {
    const folderIds = descendantIds(await db.folders.toArray(), id);
    const cardIds = await db.cards.where("folderId").anyOf(folderIds).primaryKeys();
    await db.attempts.where("cardId").anyOf(cardIds).delete();
    await db.cards.bulkDelete(cardIds);
    await db.folders.bulkDelete(folderIds);
    await db.sessions.bulkDelete(folderIds.flatMap((f) => [sessionKey(f, false), sessionKey(f, true)]));
  });
}

export async function createCard(folderId: string, question: string, solution: string): Promise<Card> {
  const now = Date.now();
  const card: Card = {
    id: newId(),
    folderId,
    question: question.trim(),
    solution: solution.trim(),
    createdAt: now,
    updatedAt: now,
  };
  await db.cards.add(card);
  return card;
}

/** Adds many cards at once, keeping their order. */
export async function createCards(
  folderId: string,
  rows: { question: string; solution: string }[],
): Promise<number> {
  const now = Date.now();
  // Cards are listed by createdAt, so each one gets its own timestamp.
  const cards: Card[] = rows.map((row, i) => ({
    id: newId(),
    folderId,
    question: row.question.trim(),
    solution: row.solution.trim(),
    createdAt: now + i,
    updatedAt: now + i,
  }));
  await db.cards.bulkAdd(cards);
  return cards.length;
}

export async function updateCard(
  id: string,
  patch: Partial<Pick<Card, "question" | "solution" | "folderId">>,
): Promise<void> {
  await db.cards.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteCard(id: string): Promise<void> {
  await db.transaction("rw", db.cards, db.attempts, async () => {
    await db.attempts.where("cardId").equals(id).delete();
    await db.cards.delete(id);
  });
}

export async function addAttempt(attempt: Omit<Attempt, "id" | "createdAt">): Promise<Attempt> {
  const full: Attempt = { ...attempt, id: newId(), createdAt: Date.now() };
  await db.attempts.add(full);
  return full;
}

export async function deleteAttempt(id: string): Promise<void> {
  await db.attempts.delete(id);
}

export async function attemptsForCard(cardId: string): Promise<Attempt[]> {
  return db.attempts.where("cardId").equals(cardId).sortBy("createdAt");
}

export async function latestAttempt(cardId: string): Promise<Attempt | undefined> {
  return (await attemptsForCard(cardId)).at(-1);
}

/** Most recent attempt per card, keyed by card id. */
export async function latestAttempts(cardIds: string[]): Promise<Map<string, Attempt>> {
  const latest = new Map<string, Attempt>();
  if (cardIds.length === 0) return latest;
  await db.attempts
    .where("cardId")
    .anyOf(cardIds)
    .each((a) => {
      const current = latest.get(a.cardId);
      if (!current || a.createdAt > current.createdAt) latest.set(a.cardId, a);
    });
  return latest;
}

/** Key of the resumable session for studying a folder, separately for all cards and weak cards only. */
export function sessionKey(folderId: string, weakOnly: boolean): string {
  return `f:${folderId}:${weakOnly ? "weak" : "all"}`;
}

export async function loadSession(key: string): Promise<SavedSession | undefined> {
  return db.sessions.get(key);
}

export async function saveSession(session: Omit<SavedSession, "updatedAt">): Promise<void> {
  await db.sessions.put({ ...session, updatedAt: Date.now() });
}

export async function clearSession(key: string): Promise<void> {
  await db.sessions.delete(key);
}

const segmentSchema = z.object({
  text: z.string(),
  status: z.enum(["correct", "missing", "unsure"]),
  note: z.string().optional(),
});

const backupSchema = z.object({
  version: z.literal(1),
  folders: z.array(
    z.object({
      id: z.string(),
      parentId: z.string().nullable(),
      name: z.string(),
      emoji: z.string(),
      createdAt: z.number(),
    }),
  ),
  cards: z.array(
    z.object({
      id: z.string(),
      folderId: z.string(),
      question: z.string(),
      solution: z.string(),
      createdAt: z.number(),
      updatedAt: z.number(),
    }),
  ),
  attempts: z.array(
    z.object({
      id: z.string(),
      cardId: z.string(),
      createdAt: z.number(),
      inputMode: z.enum(["voice", "text"]),
      answerText: z.string(),
      solutionSnapshot: z.string(),
      segments: z.array(segmentSchema),
      score: z.number(),
    }),
  ),
});

export type Backup = z.infer<typeof backupSchema>;

export async function exportAll(): Promise<Backup> {
  const [folders, cards, attempts] = await Promise.all([
    db.folders.toArray(),
    db.cards.toArray(),
    db.attempts.toArray(),
  ]);
  // Parsing drops fields that only matter on this device (sync bookkeeping).
  return backupSchema.parse({ version: 1, folders, cards, attempts });
}

/** Merges a backup into the local data. Entries with the same id are overwritten. */
export async function importAll(data: unknown): Promise<{ folders: number; cards: number; attempts: number }> {
  const backup = backupSchema.parse(data);
  await db.transaction("rw", db.folders, db.cards, db.attempts, async () => {
    await db.folders.bulkPut(backup.folders);
    await db.cards.bulkPut(backup.cards);
    await db.attempts.bulkPut(backup.attempts);
  });
  return { folders: backup.folders.length, cards: backup.cards.length, attempts: backup.attempts.length };
}
