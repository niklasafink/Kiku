import { syncRequest } from "@/lib/syncProtocol";
import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { applyChanges, changesSince } from "@/server/sync";

export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const parsed = syncRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ungültige Sync-Anfrage." }, { status: 400 });

  const db = getDb();
  await applyChanges(db, user.id, parsed.data.changes);
  return Response.json(await changesSince(db, user.id, parsed.data.cursor));
}
