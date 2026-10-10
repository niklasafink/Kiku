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

/** Sets or clears the exam the cards below this folder are scheduled towards. */
export async function setExamDate(id: string, examDate: number | null): Promise<void> {
  await db.folders.update(id, { examDate });
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
    await db.sessions.bulkDelete(folderIds.flatMap((f) => STUDY_MODES.map((mode) => sessionKey(f, mode))));
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

/** Rows written per transaction by createCards; keeps the page responsive during a large import. */
const IMPORT_BATCH = 2000;

/** Adds many cards at once, keeping their order. `onProgress` is called with the number stored so far. */
export async function createCards(
  folderId: string,
  rows: { question: string; solution: string }[],
  onProgress?: (done: number) => void,
): Promise<number> {
  const now = Date.now();
  for (let start = 0; start < rows.length; start += IMPORT_BATCH) {
    // Cards are listed by createdAt, so each one gets its own timestamp.
    const cards: Card[] = rows.slice(start, start + IMPORT_BATCH).map((row, i) => ({
      id: newId(),
      folderId,
      question: row.question.trim(),
      solution: row.solution.trim(),
      createdAt: now + start + i,
      updatedAt: now + start + i,
    }));
    await db.cards.bulkAdd(cards);
    onProgress?.(Math.min(rows.length, start + IMPORT_BATCH));
  }
  return rows.length;
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

/** What a study session over a folder covers: every card, the weak ones, or what is planned for today. */
export const STUDY_MODES = ["all", "weak", "due"] as const;
export type StudyMode = (typeof STUDY_MODES)[number];

/** Key of the resumable session for studying a folder, separately for each mode. */
export function sessionKey(folderId: string, mode: StudyMode): string {
  return `f:${folderId}:${mode}`;
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
      examDate: z.number().nullish(),
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
  /** Pictures used in cards, base64. Missing in backups made before cards could have pictures. */
  images: z.array(z.object({ id: z.string(), type: z.string(), data: z.string() })).optional(),
});

function toBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = "";
  // In pieces: a single call with every byte as an argument overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(text: string): ArrayBuffer {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export type Backup = z.infer<typeof backupSchema>;

export async function exportAll(): Promise<Backup> {
  const [folders, cards, attempts, images] = await Promise.all([
    db.folders.toArray(),
    db.cards.toArray(),
    db.attempts.toArray(),
    db.images.toArray(),
  ]);
  // Parsing drops fields that only matter on this device (sync bookkeeping).
  return backupSchema.parse({
    version: 1,
    folders,
    cards,
    attempts,
    images: images.map((image) => ({ id: image.id, type: image.type, data: toBase64(image.data) })),
  });
}

/** Merges a backup into the local data. Entries with the same id are overwritten. */
export async function importAll(data: unknown): Promise<{ folders: number; cards: number; attempts: number }> {
  const backup = backupSchema.parse(data);
  // Pictures this device does not have yet; existing ones are identical and stay as they are.
  const known = new Set(await db.images.toCollection().primaryKeys());
  const images = (backup.images ?? [])
    .filter((image) => !known.has(image.id))
    .map((image) => ({ id: image.id, type: image.type, data: fromBase64(image.data), createdAt: Date.now(), uploaded: 0 as const }));
  await db.transaction("rw", db.folders, db.cards, db.attempts, db.images, async () => {
    await db.folders.bulkPut(backup.folders);
    await db.cards.bulkPut(backup.cards);
    await db.attempts.bulkPut(backup.attempts);
    await db.images.bulkAdd(images);
  });
  return { folders: backup.folders.length, cards: backup.cards.length, attempts: backup.attempts.length };
}
