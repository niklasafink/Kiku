// Server half of the sync. Conflicts are settled per row: the change with the newer
// updatedAt wins, whichever device (or the MCP server) made it.
import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { SYNC_PAGE, type ChangeSet, type Deletion, type SyncResponse, type SyncTable } from "@/lib/syncProtocol";
import type { Database } from "./db";
import { attempts, cards, folders } from "./schema";

export const NEXT_REV = sql<number>`nextval('sync_rev')`;

/** Only overwrite a row that belongs to this user and is not newer than the incoming one. */
function ifNewer(table: { userId: PgColumn; updatedAt: PgColumn }, userId: string) {
  return sql`${table.userId} = ${userId} and excluded.updated_at >= ${table.updatedAt}`;
}

const meta = { updatedAt: sql`excluded.updated_at`, deletedAt: sql`excluded.deleted_at`, rev: NEXT_REV };

export async function applyChanges(db: Database, userId: string, changes: ChangeSet): Promise<void> {
  const own = { userId, deletedAt: null, rev: NEXT_REV };

  if (changes.folders.length > 0) {
    await db
      .insert(folders)
      .values(changes.folders.map((row) => ({ ...row, ...own })))
      .onConflictDoUpdate({
        target: folders.id,
        set: {
          ...meta,
          parentId: sql`excluded.parent_id`,
          name: sql`excluded.name`,
          emoji: sql`excluded.emoji`,
          examDate: sql`excluded.exam_date`,
        },
        setWhere: ifNewer(folders, userId),
      });
  }

  if (changes.cards.length > 0) {
    await db
      .insert(cards)
      .values(changes.cards.map((row) => ({ ...row, ...own })))
      .onConflictDoUpdate({
        target: cards.id,
        set: {
          ...meta,
          folderId: sql`excluded.folder_id`,
          question: sql`excluded.question`,
          solution: sql`excluded.solution`,
          tags: sql`excluded.tags`,
        },
        setWhere: ifNewer(cards, userId),
      });
  }

  if (changes.attempts.length > 0) {
    await db
      .insert(attempts)
      .values(changes.attempts.map((row) => ({ ...row, ...own })))
      .onConflictDoUpdate({
        target: attempts.id,
        set: {
          ...meta,
          cardId: sql`excluded.card_id`,
          inputMode: sql`excluded.input_mode`,
          answerText: sql`excluded.answer_text`,
          solutionSnapshot: sql`excluded.solution_snapshot`,
          segments: sql`excluded.segments`,
          score: sql`excluded.score`,
        },
        setWhere: ifNewer(attempts, userId),
      });
  }

  await applyDeletions(db, userId, changes.deleted);
}

/**
 * Deletions travel as rows too: an existing row only gets its deletedAt set, and a row the
 * server never saw is stored as an empty tombstone. Either way an edit made after the
 * deletion (newer updatedAt) brings the row back.
 */
export async function applyDeletions(db: Database, userId: string, deleted: Deletion[]): Promise<void> {
  const of = (table: SyncTable) => deleted.filter((d) => d.table === table);
  const tombstone = (d: Deletion) => ({
    id: d.id,
    userId,
    createdAt: d.deletedAt,
    updatedAt: d.deletedAt,
    deletedAt: d.deletedAt,
    rev: NEXT_REV,
  });

  if (of("folders").length > 0) {
    await db
      .insert(folders)
      .values(of("folders").map((d) => ({ ...tombstone(d), parentId: null, name: "", emoji: "" })))
      .onConflictDoUpdate({ target: folders.id, set: meta, setWhere: ifNewer(folders, userId) });
  }
  if (of("cards").length > 0) {
    await db
      .insert(cards)
      .values(of("cards").map((d) => ({ ...tombstone(d), folderId: "", question: "", solution: "" })))
      .onConflictDoUpdate({ target: cards.id, set: meta, setWhere: ifNewer(cards, userId) });
  }
  if (of("attempts").length > 0) {
    await db
      .insert(attempts)
      .values(
        of("attempts").map((d) => ({
          ...tombstone(d),
          cardId: "",
          inputMode: "text" as const,
          answerText: "",
          solutionSnapshot: "",
          segments: [],
          score: 0,
        })),
      )
      .onConflictDoUpdate({ target: attempts.id, set: meta, setWhere: ifNewer(attempts, userId) });
  }
}

/** Everything of this user that changed after `cursor`, in pages. */
export async function changesSince(db: Database, userId: string, cursor: number): Promise<SyncResponse> {
  const changed = (table: { userId: PgColumn; rev: PgColumn }) => and(eq(table.userId, userId), gt(table.rev, cursor));
  const [folderRows, cardRows, attemptRows] = await Promise.all([
    db.select().from(folders).where(changed(folders)).orderBy(asc(folders.rev)).limit(SYNC_PAGE),
    db.select().from(cards).where(changed(cards)).orderBy(asc(cards.rev)).limit(SYNC_PAGE),
    db.select().from(attempts).where(changed(attempts)).orderBy(asc(attempts.rev)).limit(SYNC_PAGE),
  ]);
  const pages = [folderRows, cardRows, attemptRows];

  // If a table filled its page, later revisions of the other tables must wait for the next
  // request, otherwise the cursor would skip rows of the full table.
  const full = pages.filter((rows) => rows.length === SYNC_PAGE);
  const upper =
    full.length > 0
      ? Math.min(...full.map((rows) => rows.at(-1)!.rev))
      : Math.max(cursor, ...pages.flat().map((row) => row.rev));

  const deleted: Deletion[] = [];
  const live = <T extends { rev: number; deletedAt: number | null; id: string }>(rows: T[], table: SyncTable) =>
    rows.filter((row) => {
      if (row.rev > upper) return false;
      if (row.deletedAt === null) return true;
      deleted.push({ table, id: row.id, deletedAt: row.deletedAt });
      return false;
    });

  return {
    cursor: upper,
    more: full.length > 0,
    changes: {
      folders: live(folderRows, "folders").map(({ id, parentId, name, emoji, examDate, createdAt, updatedAt }) => ({
        id,
        parentId,
        name,
        emoji,
        examDate,
        createdAt,
        updatedAt,
      })),
      cards: live(cardRows, "cards").map(({ id, folderId, question, solution, tags, createdAt, updatedAt }) => ({
        id,
        folderId,
        question,
        solution,
        tags,
        createdAt,
        updatedAt,
      })),
      attempts: live(attemptRows, "attempts").map((a) => ({
        id: a.id,
        cardId: a.cardId,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        inputMode: a.inputMode,
        answerText: a.answerText,
        solutionSnapshot: a.solutionSnapshot,
        segments: a.segments,
        score: a.score,
      })),
      deleted,
    },
  };
}
