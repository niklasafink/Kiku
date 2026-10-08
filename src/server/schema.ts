import { bigint, index, integer, jsonb, pgSequence, pgTable, text } from "drizzle-orm/pg-core";
import type { Segment } from "@/lib/types";

/** Every write takes the next value. Clients pull "everything with a higher rev than last time". */
export const syncRev = pgSequence("sync_rev");

const ms = (name: string) => bigint(name, { mode: "number" });

// Columns every synced table shares. Timestamps are milliseconds, as set by the client.
// Rows are never removed: a deletion sets deletedAt so other devices learn about it.
const synced = () => ({
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  createdAt: ms("created_at").notNull(),
  updatedAt: ms("updated_at").notNull(),
  deletedAt: ms("deleted_at"),
  rev: ms("rev").notNull(),
});

export const folders = pgTable(
  "folders",
  {
    ...synced(),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    emoji: text("emoji").notNull(),
  },
  (t) => [index("folders_user_rev").on(t.userId, t.rev)],
);

export const cards = pgTable(
  "cards",
  {
    ...synced(),
    folderId: text("folder_id").notNull(),
    question: text("question").notNull(),
    solution: text("solution").notNull(),
  },
  (t) => [index("cards_user_rev").on(t.userId, t.rev)],
);

export const attempts = pgTable(
  "attempts",
  {
    ...synced(),
    cardId: text("card_id").notNull(),
    inputMode: text("input_mode").$type<"voice" | "text">().notNull(),
    answerText: text("answer_text").notNull(),
    solutionSnapshot: text("solution_snapshot").notNull(),
    segments: jsonb("segments").$type<Segment[]>().notNull(),
    score: integer("score").notNull(),
  },
  (t) => [index("attempts_user_rev").on(t.userId, t.rev), index("attempts_card").on(t.cardId)],
);

/** Personal access tokens for the MCP endpoint. Only a hash is stored. */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: ms("created_at").notNull(),
    lastUsedAt: ms("last_used_at"),
  },
  (t) => [index("api_tokens_user").on(t.userId)],
);

/** Daily counters of the public demo on the homepage. The id is a hash, no IP address is stored. */
export const demoUsage = pgTable("demo_usage", {
  id: text("id").primaryKey(),
  day: text("day").notNull(),
  count: integer("count").notNull(),
});
