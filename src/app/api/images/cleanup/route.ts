import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { deleteUnusedImages } from "@/server/images";

/** Removes pictures that none of the account's cards uses any more. Called by the app about once a day. */
export async function POST() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  return Response.json({ deleted: await deleteUnusedImages(getDb(), user.id) });
}
