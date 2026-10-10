// Pictures used in cards. Each one is uploaded once and never changes afterwards.
import { and, count, eq } from "drizzle-orm";
import type { Database } from "./db";
import { images } from "./schema";

/** The browser scales pictures down to 1.5 MB at most; a little room on top. */
export const MAX_IMAGE_BYTES = 2_000_000;
export const IMAGE_TYPES = ["image/webp", "image/jpeg", "image/png", "image/gif"];
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
