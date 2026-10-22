// Pictures used in cards. Each one is uploaded once and never changes afterwards.
import { and, count, eq, inArray, isNull, like, lt, or } from "drizzle-orm";
import { imageIds } from "@/lib/richText";
import type { Database } from "./db";
import { cards, images } from "./schema";

/** The browser scales pictures down to 1.5 MB at most; a little room on top. */
export const MAX_IMAGE_BYTES = 2_000_000;
/** A PDF (task or solution of a card): as much as a request body may hold, see lib/pdfLimits.ts. */
export const MAX_PDF_BYTES = 4_200_000;
export const IMAGE_TYPES = ["image/webp", "image/jpeg", "image/png", "image/gif", "application/pdf", "application/json"];
/** Far more than a library needs; stops an account from filling the database. */
export const MAX_IMAGES_PER_USER = 5000;

export const isImageId = (id: string) => /^[A-Za-z0-9-]{8,64}$/.test(id);

export type PutResult = "stored" | "exists" | "taken" | "full";

export async function putImage(
  db: Database,
  userId: string,
  image: { id: string; mime: string; bytes: Uint8Array },
): Promise<PutResult> {
  const [existing] = await db.select({ userId: images.userId }).from(images).where(eq(images.id, image.id));
  if (existing) return existing.userId === userId ? "exists" : "taken";

  const [{ total }] = await db.select({ total: count() }).from(images).where(eq(images.userId, userId));
  if (total >= MAX_IMAGES_PER_USER) return "full";

  await db
    .insert(images)
    .values({
      id: image.id,
      userId,
      mime: image.mime,
      data: Buffer.from(image.bytes).toString("base64"),
      size: image.bytes.byteLength,
      createdAt: Date.now(),
    })
    .onConflictDoNothing();
  return "stored";
}

export async function getImage(db: Database, userId: string, id: string): Promise<{ mime: string; bytes: Buffer } | null> {
  const [row] = await db
    .select({ mime: images.mime, data: images.data })
    .from(images)
    .where(and(eq(images.id, id), eq(images.userId, userId)));
  return row ? { mime: row.mime, bytes: Buffer.from(row.data, "base64") } : null;
}

/** A picture no card uses is removed once it is this old; until then its card may still be on its way. */
const UNUSED_AFTER_MS = 7 * 86_400_000;

/** Deletes the account's pictures that none of its cards refers to any more. Returns how many. */
export async function deleteUnusedImages(db: Database, userId: string, now = Date.now()): Promise<number> {
  const candidates = await db
    .select({ id: images.id })
    .from(images)
    .where(and(eq(images.userId, userId), lt(images.createdAt, now - UNUSED_AFTER_MS)));
  if (candidates.length === 0) return 0;

  const texts = await db
    .select({ question: cards.question, solution: cards.solution })
    .from(cards)
    .where(
      and(
        eq(cards.userId, userId),
        isNull(cards.deletedAt),
        or(like(cards.question, "%kiku-img:%"), like(cards.solution, "%kiku-img:%")),
      ),
    );
  const used = new Set(texts.flatMap((card) => [...imageIds(card.question), ...imageIds(card.solution)]));
  const unused = candidates.map((image) => image.id).filter((id) => !used.has(id));
  // In pieces, to stay well below the limit of parameters per statement.
  for (let i = 0; i < unused.length; i += 500) {
    await db.delete(images).where(and(eq(images.userId, userId), inArray(images.id, unused.slice(i, i + 500))));
  }
  return unused.length;
}
