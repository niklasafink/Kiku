import { z } from "zod";
import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { createToken, listTokens } from "@/server/tokens";

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  return Response.json({ tokens: await listTokens(getDb(), user.id) });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = z.object({ name: z.string().max(60) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  return Response.json(await createToken(getDb(), user.id, body.data.name));
}
