import { z } from "zod";
import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { getStudyPlan, setPlanDone } from "@/server/studyPlan";

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  return Response.json((await getStudyPlan(getDb(), user.id)) ?? { plan: null, done: [] });
}

export async function PUT(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = z.object({ done: z.array(z.string().max(120)).max(2000) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  if (!(await setPlanDone(getDb(), user.id, body.data.done))) {
    return Response.json({ error: "Für dieses Konto gibt es keinen Lernplan." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
