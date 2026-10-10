import { z } from "zod";
import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { createShare, deleteShare, shareOf } from "@/server/shares";

const body = z.object({ folderId: z.string().min(1).max(100) });

/** The share link of one of your folders: ?folderId= */
export async function GET(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const folderId = new URL(request.url).searchParams.get("folderId") ?? "";
  return Response.json({ token: await shareOf(getDb(), user.id, folderId) });
}

/** Shares a folder. It has to be on the server already, i.e. synced. */
export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const token = await createShare(getDb(), user.id, parsed.data.folderId);
  if (!token) {
    return Response.json({ error: "Der Ordner ist noch nicht synchronisiert. Versuche es gleich noch einmal." }, { status: 404 });
  }
  return Response.json({ token });
}

export async function DELETE(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  await deleteShare(getDb(), user.id, parsed.data.folderId);
  return new Response(null, { status: 204 });
}
