// Grades the answers that were given without a network, once there is one again. Each one
// becomes an ordinary attempt with the time the answer was given, so the streak and the
// schedule see it on the right day.
import { recognizeInk } from "./ink";
import { db } from "./db";
import { addAttempt, deletePendingAnswer, pendingAnswers } from "./repo";
import { toPlainText } from "./richText";
import { pathTo } from "./tree";
import type { PendingAnswer, Segment } from "./types";

/** A failed fetch: no network, or the server could not be reached. */
export const isOffline = (error: unknown) =>
  (typeof navigator !== "undefined" && navigator.onLine === false) || error instanceof TypeError;

async function gradeOne(entry: PendingAnswer): Promise<"graded" | "dropped" | "later"> {
  let answer = entry.answer;
  if (entry.ink && entry.ink.length > 0) {
    const written = await recognizeInk(entry.ink);
    answer = [answer.trim(), written].filter(Boolean).join(" ");
  }
  const solution = toPlainText(entry.solutionSnapshot);
  if (!answer.trim() || !solution) return "dropped";

  // The folders the card lies in tell the AI subject and topic.
  const card = await db.cards.get(entry.cardId);
  const context = card
    ? pathTo(await db.folders.toArray(), card.folderId).map((folder) => folder.name).join(" › ").slice(0, 500)
    : "";
  const response = await fetch("/api/grade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: toPlainText(entry.question), solution, answer, context }),
  });
  if (response.status === 400 || response.status === 413) return "dropped";
  // Used-up allowance, server trouble: the answer keeps waiting.
  if (!response.ok) return "later";
  const data = await response.json();
  await addAttempt({
    cardId: entry.cardId,
    createdAt: entry.createdAt,
    inputMode: entry.inputMode,
    answerText: answer.trim(),
    solutionSnapshot: entry.solutionSnapshot,
    segments: data.segments as Segment[],
    score: data.score as number,
  });
  return "graded";
}

let running: Promise<{ graded: number; left: number }> | null = null;

/** Grades what is waiting, oldest first; stops at the first answer that has to wait longer. */
export function gradePendingAnswers(): Promise<{ graded: number; left: number }> {
  if (running) return running;
  running = (async () => {
    let graded = 0;
    const queue = await pendingAnswers();
    let left = queue.length;
    for (const entry of queue) {
      let result: "graded" | "dropped" | "later";
      try {
        result = await gradeOne(entry);
      } catch (error) {
        if (isOffline(error)) break;
        result = "later";
      }
      if (result === "later") break;
      await deletePendingAnswer(entry.id);
      left--;
      if (result === "graded") graded++;
    }
    return { graded, left };
  })().finally(() => {
    running = null;
  });
  return running;
}
