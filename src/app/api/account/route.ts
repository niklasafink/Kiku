import { requireUser } from "@/server/auth";
import { deleteUserData } from "@/server/account";
import { getDb } from "@/server/db";

/** Removes everything the account stored. The browser deletes the account itself at Neon Auth afterwards. */
export async function DELETE() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  await deleteUserData(getDb(), user.id);
  return Response.json({ ok: true });
}
