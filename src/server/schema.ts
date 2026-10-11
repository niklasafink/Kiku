import { bigint, index, integer, jsonb, pgSequence, pgTable, text } from "drizzle-orm/pg-core";
import type { StudyPlan } from "@/lib/studyPlan";
import type { InputMode, Segment } from "@/lib/types";

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
    examDate: ms("exam_date"),
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
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
  },
  (t) => [index("cards_user_rev").on(t.userId, t.rev)],
);

export const attempts = pgTable(
  "attempts",
  {
    ...synced(),
    cardId: text("card_id").notNull(),
    inputMode: text("input_mode").$type<InputMode>().notNull(),
    answerText: text("answer_text").notNull(),
    solutionSnapshot: text("solution_snapshot").notNull(),
    segments: jsonb("segments").$type<Segment[]>().notNull(),
    score: integer("score").notNull(),
  },
  (t) => [index("attempts_user_rev").on(t.userId, t.rev), index("attempts_card").on(t.cardId)],
);

/** Pictures used in cards, uploaded one by one. They never change, so there is nothing to sync. */
export const images = pgTable(
  "images",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    mime: text("mime").notNull(),
    /** Base64. Pictures are scaled down in the browser and stay small. */
    data: text("data").notNull(),
    size: integer("size").notNull(),
    createdAt: ms("created_at").notNull(),
  },
  (t) => [index("images_user").on(t.userId)],
);

/** A folder made readable for anyone who has the link. The id is the secret in that link. */
export const shares = pgTable(
  "shares",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    folderId: text("folder_id").notNull(),
    createdAt: ms("created_at").notNull(),
  },
  (t) => [index("shares_user_folder").on(t.userId, t.folderId)],
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

/** One study plan per account, with the keys of the steps ticked off so far. */
export const studyPlans = pgTable("study_plans", {
  userId: text("user_id").primaryKey(),
  plan: jsonb("plan").$type<StudyPlan>().notNull(),
  done: jsonb("done").$type<string[]>().notNull().default([]),
  updatedAt: ms("updated_at").notNull(),
});

/**
 * Daily counters: the public demo on the homepage (the id is a hash, no IP address is stored)
 * and AI card generation per account.
 */
export const demoUsage = pgTable("demo_usage", {
  id: text("id").primaryKey(),
  day: text("day").notNull(),
  count: integer("count").notNull(),
});
