// Single entry point for all persistence. Everything is local (IndexedDB) for now;
// a server database or sync layer can later be added behind these functions.
import { z } from "zod";
import { db } from "./db";
import { packStroke, unpackStroke, type Stroke } from "./ink";
import { MAX_TAG_LENGTH, MAX_TAGS } from "./syncProtocol";
import { descendantIds } from "./tree";
import type { Attempt, Card, Folder, PendingAnswer, SavedSession } from "./types";

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

/** What a deletion removed, so that it can be undone. */
export interface Deleted {
  folders: Folder[];
  cards: Card[];
  attempts: Attempt[];
}

/** Deletes the folder, all nested folders, their cards and those cards' attempts. */
export async function deleteFolderRecursive(id: string): Promise<Deleted> {
  return db.transaction("rw", db.folders, db.cards, db.attempts, db.sessions, async () => {
    const folderIds = descendantIds(await db.folders.toArray(), id);
    const folders = await db.folders.bulkGet(folderIds);
    const cards = await db.cards.where("folderId").anyOf(folderIds).toArray();
    const cardIds = cards.map((card) => card.id);
    const attempts = await db.attempts.where("cardId").anyOf(cardIds).toArray();
    await db.attempts.bulkDelete(attempts.map((attempt) => attempt.id));
    await db.cards.bulkDelete(cardIds);
    await db.folders.bulkDelete(folderIds);
    await db.sessions.bulkDelete(folderIds.flatMap((f) => STUDY_MODES.flatMap((mode) => [sessionKey(f, mode), filesKey(sessionKey(f, mode))])));
    return { folders: folders.filter((folder) => folder !== undefined), cards, attempts };
  });
}

/**
 * Puts deleted rows back. They count as changed now, so on the server they win against the
 * deletion that may already have been sent (see applyDeletions in src/server/sync.ts).
 */
export async function restoreDeleted({ folders, cards, attempts }: Deleted): Promise<void> {
  const now = Date.now();
  await db.transaction("rw", db.folders, db.cards, db.attempts, async () => {
    await db.folders.bulkPut(folders.map((folder) => ({ ...folder, updatedAt: now })));
    await db.cards.bulkPut(cards.map((card) => ({ ...card, updatedAt: now })));
    await db.attempts.bulkPut(attempts.map((attempt) => ({ ...attempt, updatedAt: now })));
  });
}

/** Moves cards into another folder. */
export async function moveCards(ids: string[], folderId: string): Promise<void> {
  const now = Date.now();
  await db.transaction("rw", db.cards, db.folders, async () => {
    if (!(await db.folders.get(folderId))) throw new Error("Der Zielordner existiert nicht mehr.");
    await db.cards.where("id").anyOf(ids).modify({ folderId, updatedAt: now });
  });
}

/** Gives every card the tag, where it does not have it yet. */
export async function addTagToCards(ids: string[], tag: string): Promise<void> {
  const clean = cleanTag(tag);
  if (!clean) return;
  const key = clean.toLocaleLowerCase("de");
  await db.transaction("rw", db.cards, async () => {
    for (const card of await db.cards.bulkGet(ids)) {
      const tags = card?.tags ?? [];
      if (!card || tags.some((t) => t.toLocaleLowerCase("de") === key) || tags.length >= MAX_TAGS) continue;
      await db.cards.update(card.id, { tags: [...tags, clean], updatedAt: Date.now() });
    }
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
  rows: { question: string; solution: string; tags?: string[] }[],
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
      ...(row.tags?.length ? { tags: row.tags } : {}),
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

/** Tidy form of a tag as typed: no "#", single spaces. */
export function cleanTag(tag: string): string {
  return tag.replace(/^#+/, "").replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH);
}

/** Replaces the tags of a card. Duplicates (ignoring case) and empty ones drop out. */
export async function setCardTags(id: string, tags: string[]): Promise<void> {
  const seen = new Set<string>();
  const clean = tags.map(cleanTag).filter((tag) => {
    const key = tag.toLocaleLowerCase("de");
    if (!tag || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  await db.cards.update(id, { tags: clean.slice(0, MAX_TAGS), updatedAt: Date.now() });
}

/** Adds the tag to the card, or takes it away if the card has it. */
export async function toggleCardTag(id: string, tag: string): Promise<void> {
  const tags = (await db.cards.get(id))?.tags ?? [];
  await setCardTags(id, tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]);
}

/** Deletes cards with their attempts. */
export async function deleteCards(ids: string[]): Promise<Deleted> {
  return db.transaction("rw", db.cards, db.attempts, async () => {
    const cards = (await db.cards.bulkGet(ids)).filter((card) => card !== undefined);
    const attempts = await db.attempts.where("cardId").anyOf(ids).toArray();
    await db.attempts.bulkDelete(attempts.map((attempt) => attempt.id));
    await db.cards.bulkDelete(ids);
    return { folders: [], cards, attempts };
  });
}

export const deleteCard = (id: string) => deleteCards([id]);

/** Stores an attempt; `createdAt` is given for an answer that waited for a connection. */
export async function addAttempt(attempt: Omit<Attempt, "id" | "createdAt"> & { createdAt?: number }): Promise<Attempt> {
  const full: Attempt = { ...attempt, id: newId(), createdAt: attempt.createdAt ?? Date.now() };
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

/**
 * What a study session over a folder covers: every card, the weak ones, what is planned for
 * today, or an exam simulation (a random draw, graded at the end).
 */
export const STUDY_MODES = ["all", "weak", "due", "exam"] as const;
export type StudyMode = (typeof STUDY_MODES)[number];

/** Key of the resumable session for studying a folder, separately for each mode. */
export function sessionKey(folderId: string, mode: StudyMode): string {
  return `f:${folderId}:${mode}`;
}

/** Key of the stored session for practising one card, or the cards of a tag or of today outside a folder. */
export const cardSessionKey = (cardId: string) => `c:${cardId}`;
export const learnSessionKey = (tag: string | null, folderId: string | null) => `l:${tag ?? "today"}:${folderId ?? ""}`;

/**
 * The answer files of a session are kept in a row of their own: the session is written with every
 * letter and stroke, the files only when one is added.
 */
const filesKey = (key: string) => `${key}#files`;

/** The handwriting of each card in a session, packed for storing or unpacked after loading (see packStroke). */
function mapInk(states: SavedSession["states"], map: (stroke: Stroke) => Stroke): SavedSession["states"] {
  return Object.fromEntries(Object.entries(states).map(([id, state]) => [id, state.ink ? { ...state, ink: state.ink.map(map) } : state]));
}

export async function loadSession(key: string): Promise<SavedSession | undefined> {
  const [session, files] = await db.sessions.bulkGet([key, filesKey(key)]);
  return session && { ...session, states: mapInk(session.states, unpackStroke), files: files?.files };
}

export async function saveSession(session: Omit<SavedSession, "updatedAt" | "files">): Promise<void> {
  // Stored packed; the type of the row stays that of the session as it is used.
  await db.sessions.put({ ...session, states: mapInk(session.states, packStroke as unknown as (stroke: Stroke) => Stroke), updatedAt: Date.now() });
}

export async function saveSessionFiles(key: string, files: Record<string, File>): Promise<void> {
  await db.sessions.put({ key: filesKey(key), cardIds: [], index: 0, states: {}, files, updatedAt: Date.now() });
}

export async function clearSession(key: string): Promise<void> {
  await db.sessions.bulkDelete([key, filesKey(key)]);
}

/** Keeps an answer given without a network until it can be graded. */
export async function queuePendingAnswer(entry: Omit<PendingAnswer, "id" | "createdAt">): Promise<PendingAnswer> {
  const full: PendingAnswer = { ...entry, id: newId(), createdAt: Date.now() };
  await db.pending.add(full);
  return full;
}

export async function pendingAnswers(): Promise<PendingAnswer[]> {
  return (await db.pending.toArray()).sort((a, b) => a.createdAt - b.createdAt);
}

export async function deletePendingAnswer(id: string): Promise<void> {
  await db.pending.delete(id);
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
      tags: z.array(z.string()).optional(),
      createdAt: z.number(),
      updatedAt: z.number(),
    }),
  ),
  attempts: z.array(
    z.object({
      id: z.string(),
      cardId: z.string(),
      createdAt: z.number(),
      inputMode: z.enum(["voice", "text", "pen"]),
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
