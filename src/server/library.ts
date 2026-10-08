// Server-side operations on one user's library, used by the MCP server. Every write bumps
// updatedAt and rev, so browsers pick the change up on their next sync.
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { descendantIds, pathTo } from "@/lib/tree";
import type { Folder } from "@/lib/types";
import type { Database } from "./db";
import { attempts, cards, folders } from "./schema";
import { NEXT_REV } from "./sync";

/** A problem the caller can fix (unknown id, invalid move); the message is shown to the assistant. */
export class LibraryError extends Error {}

const escapeLike = (text: string) => text.replace(/[\\%_]/g, "\\$&");

export async function listFolders(db: Database, userId: string): Promise<Folder[]> {
  return db
    .select({
      id: folders.id,
      parentId: folders.parentId,
      name: folders.name,
      emoji: folders.emoji,
      createdAt: folders.createdAt,
    })
    .from(folders)
    .where(and(eq(folders.userId, userId), isNull(folders.deletedAt)))
    .orderBy(asc(folders.name));
}

async function requireFolder(db: Database, userId: string, id: string): Promise<{ all: Folder[]; folder: Folder }> {
  const all = await listFolders(db, userId);
  const folder = all.find((f) => f.id === id);
  if (!folder) throw new LibraryError(`Folder ${id} does not exist.`);
  return { all, folder };
}

async function requireCard(db: Database, userId: string, id: string) {
  const [card] = await db
    .select()
    .from(cards)
    .where(and(eq(cards.userId, userId), eq(cards.id, id), isNull(cards.deletedAt)));
  if (!card) throw new LibraryError(`Card ${id} does not exist.`);
  return card;
}

/** Folder tree with paths and card counts; the usual starting point for an assistant. */
export async function overview(db: Database, userId: string) {
  const all = await listFolders(db, userId);
  const cardRows = await db
    .select({ folderId: cards.folderId })
    .from(cards)
    .where(and(eq(cards.userId, userId), isNull(cards.deletedAt)));
  const direct = new Map<string, number>();
  for (const row of cardRows) direct.set(row.folderId, (direct.get(row.folderId) ?? 0) + 1);

  return {
    totalCards: cardRows.length,
    folders: all
      .map((folder) => ({
        id: folder.id,
        parentId: folder.parentId,
        path: pathTo(all, folder.id)
          .map((f) => f.name)
          .join(" / "),
        emoji: folder.emoji,
        cards: direct.get(folder.id) ?? 0,
        cardsIncludingSubfolders: descendantIds(all, folder.id).reduce((sum, id) => sum + (direct.get(id) ?? 0), 0),
      }))
      .sort((a, b) => a.path.localeCompare(b.path, "de")),
  };
}

export async function listCards(
  db: Database,
  userId: string,
  options: { folderId?: string; includeSubfolders?: boolean; query?: string; limit?: number; offset?: number },
) {
  const filters = [eq(cards.userId, userId), isNull(cards.deletedAt)];
  if (options.folderId) {
    const { all } = await requireFolder(db, userId, options.folderId);
    const ids = options.includeSubfolders === false ? [options.folderId] : descendantIds(all, options.folderId);
    filters.push(inArray(cards.folderId, ids));
  }
  if (options.query?.trim()) {
    const pattern = `%${escapeLike(options.query.trim())}%`;
    filters.push(or(ilike(cards.question, pattern), ilike(cards.solution, pattern))!);
  }

  const rows = await db
    .select({
      id: cards.id,
      folderId: cards.folderId,
      question: cards.question,
      solution: cards.solution,
      updatedAt: cards.updatedAt,
    })
    .from(cards)
    .where(and(...filters))
    .orderBy(asc(cards.createdAt))
    .limit(options.limit ?? 50)
    .offset(options.offset ?? 0);

  // Latest score per card, so "which cards am I worst at" needs no second call.
  const history = rows.length
    ? await db
        .select({ cardId: attempts.cardId, score: attempts.score, createdAt: attempts.createdAt })
        .from(attempts)
        .where(and(eq(attempts.userId, userId), isNull(attempts.deletedAt), inArray(attempts.cardId, rows.map((r) => r.id))))
        .orderBy(asc(attempts.createdAt))
    : [];
  const stats = new Map<string, { attempts: number; lastScore: number }>();
  for (const a of history) stats.set(a.cardId, { attempts: (stats.get(a.cardId)?.attempts ?? 0) + 1, lastScore: a.score });

  return rows.map((row) => ({
    ...row,
    attempts: stats.get(row.id)?.attempts ?? 0,
    lastScore: stats.get(row.id)?.lastScore ?? null,
  }));
}

export async function getCard(db: Database, userId: string, id: string) {
  const card = await requireCard(db, userId, id);
  const history = await db
    .select({
      id: attempts.id,
      createdAt: attempts.createdAt,
      inputMode: attempts.inputMode,
      score: attempts.score,
      answerText: attempts.answerText,
      segments: attempts.segments,
    })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.cardId, id), isNull(attempts.deletedAt)))
    .orderBy(desc(attempts.createdAt))
    .limit(20);
  return {
    id: card.id,
    folderId: card.folderId,
    question: card.question,
    solution: card.solution,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    attempts: history,
  };
}

export async function createFolder(
  db: Database,
  userId: string,
  input: { name: string; emoji?: string; parentId?: string | null },
) {
  if (input.parentId) await requireFolder(db, userId, input.parentId);
  const now = Date.now();
  const folder = {
    id: randomUUID(),
    parentId: input.parentId ?? null,
    name: input.name.trim(),
    emoji: input.emoji ?? "📁",
    createdAt: now,
  };
  await db.insert(folders).values({ ...folder, userId, updatedAt: now, deletedAt: null, rev: NEXT_REV });
  return folder;
}

export async function updateFolder(
  db: Database,
  userId: string,
  id: string,
  patch: { name?: string; emoji?: string; parentId?: string | null },
) {
  const { all, folder } = await requireFolder(db, userId, id);
  if (patch.parentId) {
    if (!all.some((f) => f.id === patch.parentId)) throw new LibraryError(`Folder ${patch.parentId} does not exist.`);
    if (descendantIds(all, id).includes(patch.parentId)) {
      throw new LibraryError("A folder cannot be moved into itself or one of its subfolders.");
    }
  }
  const next = {
    name: patch.name?.trim() || folder.name,
    emoji: patch.emoji ?? folder.emoji,
    parentId: patch.parentId === undefined ? folder.parentId : patch.parentId,
  };
  await db
    .update(folders)
    .set({ ...next, updatedAt: Date.now(), rev: NEXT_REV })
    .where(and(eq(folders.userId, userId), eq(folders.id, id)));
  return { ...folder, ...next };
}

/** Deletes the folder with all subfolders, their cards and those cards' history. */
export async function deleteFolder(db: Database, userId: string, id: string) {
  const { all } = await requireFolder(db, userId, id);
  const folderIds = descendantIds(all, id);
  const cardIds = (
    await db
      .select({ id: cards.id })
      .from(cards)
      .where(and(eq(cards.userId, userId), isNull(cards.deletedAt), inArray(cards.folderId, folderIds)))
  ).map((c) => c.id);

  const now = Date.now();
  const gone = { deletedAt: now, updatedAt: now, rev: NEXT_REV };
  if (cardIds.length > 0) {
    await db.update(attempts).set(gone).where(and(eq(attempts.userId, userId), inArray(attempts.cardId, cardIds)));
    await db.update(cards).set(gone).where(and(eq(cards.userId, userId), inArray(cards.id, cardIds)));
  }
  await db.update(folders).set(gone).where(and(eq(folders.userId, userId), inArray(folders.id, folderIds)));
  return { deletedFolders: folderIds.length, deletedCards: cardIds.length };
}

export async function createCards(
  db: Database,
  userId: string,
  folderId: string,
  rows: { question: string; solution: string }[],
) {
  await requireFolder(db, userId, folderId);
  const now = Date.now();
  // Cards are listed by createdAt, so each one gets its own timestamp.
  const created = rows.map((row, i) => ({
    id: randomUUID(),
    folderId,
    question: row.question.trim(),
    solution: row.solution.trim(),
    createdAt: now + i,
    updatedAt: now + i,
  }));
  await db.insert(cards).values(created.map((card) => ({ ...card, userId, deletedAt: null, rev: NEXT_REV })));
  return created.map(({ id, question }) => ({ id, question }));
}

export async function updateCard(
  db: Database,
  userId: string,
  id: string,
  patch: { question?: string; solution?: string; folderId?: string },
) {
  const card = await requireCard(db, userId, id);
  if (patch.folderId) await requireFolder(db, userId, patch.folderId);
  const next = {
    question: patch.question?.trim() || card.question,
    solution: patch.solution?.trim() || card.solution,
    folderId: patch.folderId ?? card.folderId,
  };
  await db
    .update(cards)
    .set({ ...next, updatedAt: Date.now(), rev: NEXT_REV })
    .where(and(eq(cards.userId, userId), eq(cards.id, id)));
  return { id, ...next };
}

/** Deletes the card and its history. */
export async function deleteCard(db: Database, userId: string, id: string) {
  await requireCard(db, userId, id);
  const now = Date.now();
  const gone = { deletedAt: now, updatedAt: now, rev: NEXT_REV };
  await db.update(attempts).set(gone).where(and(eq(attempts.userId, userId), eq(attempts.cardId, id)));
  await db.update(cards).set(gone).where(and(eq(cards.userId, userId), eq(cards.id, id)));
  return { deleted: id };
}
