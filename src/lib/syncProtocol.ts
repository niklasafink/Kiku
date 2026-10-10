// Wire format of POST /api/sync, shared by the browser and the server.
import { z } from "zod";

const id = z.string().min(1).max(100);
const ms = z.number().int().nonnegative();

/** Longest question or solution a card may have. */
export const MAX_CARD_TEXT = 20_000;

export const folderRow = z.object({
  id,
  parentId: id.nullable(),
  name: z.string().max(200),
  emoji: z.string().max(16),
  examDate: ms.nullish(),
  createdAt: ms,
  updatedAt: ms,
});

export const cardRow = z.object({
  id,
  folderId: id,
  question: z.string().max(MAX_CARD_TEXT),
  solution: z.string().max(MAX_CARD_TEXT),
  createdAt: ms,
  updatedAt: ms,
});

export const attemptRow = z.object({
  id,
  cardId: id,
  createdAt: ms,
  updatedAt: ms,
  inputMode: z.enum(["voice", "text"]),
  answerText: z.string().max(50_000),
  solutionSnapshot: z.string().max(20_000),
  segments: z.array(
    z.object({
      text: z.string(),
      status: z.enum(["correct", "missing", "unsure"]),
      note: z.string().optional(),
    }),
  ),
  score: z.number().int().min(0).max(100),
});

export const SYNC_TABLES = ["folders", "cards", "attempts"] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

export const deletion = z.object({ table: z.enum(SYNC_TABLES), id, deletedAt: ms });

/** Rows per request in either direction; keeps every request far below body size limits. */
export const SYNC_PAGE = 200;

export const changeSet = z.object({
  folders: z.array(folderRow).max(SYNC_PAGE),
  cards: z.array(cardRow).max(SYNC_PAGE),
  attempts: z.array(attemptRow).max(SYNC_PAGE),
  deleted: z.array(deletion).max(SYNC_PAGE * 5),
});

export const syncRequest = z.object({
  /** Highest server revision this device has already applied. */
  cursor: ms,
  changes: changeSet,
});

export type FolderRow = z.infer<typeof folderRow>;
export type CardRow = z.infer<typeof cardRow>;
export type AttemptRow = z.infer<typeof attemptRow>;
export type Deletion = z.infer<typeof deletion>;
export type ChangeSet = z.infer<typeof changeSet>;
export type SyncRequest = z.infer<typeof syncRequest>;

export interface SyncResponse {
  cursor: number;
  /** True if the server has more changes than fit into this response; ask again. */
  more: boolean;
  changes: ChangeSet;
}
