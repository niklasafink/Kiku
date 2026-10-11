import { z } from "zod";
import { passwordMatches, requireUser } from "@/server/auth";
import { deleteAuthUser, deleteUserData } from "@/server/account";
import { getDb } from "@/server/db";

const requestSchema = z.object({ password: z.string().min(1).max(1000) });

/**
 * Deletes the account for good: everything it stored first, then the sign-in account, so a failure
 * in between never leaves data behind that nobody can reach. Both steps can be repeated.
 */
export async function DELETE(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });

  // The session alone is not enough: the password proves it is really the owner.
  const matches = await passwordMatches(
    user.email,
    parsed.data.password,
    request.headers.get("origin") ?? new URL(request.url).origin,
  );
  if (matches === null) {
    return Response.json({ error: "Das Passwort konnte gerade nicht geprüft werden. Bitte versuche es noch einmal." }, { status: 503 });
  }
  if (!matches) return Response.json({ error: "Das Passwort stimmt nicht." }, { status: 403 });

  const db = getDb();
  await deleteUserData(db, user.id);
  await deleteAuthUser(db, user.id);
  return Response.json({ ok: true });
}
