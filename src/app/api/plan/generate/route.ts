import { z } from "zod";
import { errorResponse, FREE_PLAN_GRADING_MODELS } from "@/lib/ai";
import { schedulePlan } from "@/lib/studyPlan";
import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { planTopics } from "@/server/generatePlan";
import { planOf } from "@/server/plan";
import { refundGenerateQuota, takeGenerateQuota } from "@/server/quota";
import { putStudyPlan } from "@/server/studyPlan";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const requestSchema = z.object({
  /** outlineMaterial() of the files, made in the browser. */
  outline: z.string().trim().min(80).max(80_000),
  focus: z.string().trim().max(500).default(""),
  /** The learner's own day, so the first week starts where they are. */
  today: day,
  examDate: day,
  hoursPerDay: z.number().min(0.5).max(14),
  daysPerWeek: z.number().int().min(1).max(7),
});

/** Makes a study plan from uploaded material and replaces the account's plan with it. */
export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const { outline, focus, today, examDate, hoursPerDay, daysPerWeek } = parsed.data;
  if (examDate <= today) return Response.json({ error: "Das Prüfungsdatum muss in der Zukunft liegen." }, { status: 400 });

  const plan = planOf(user);
  if ((await takeGenerateQuota(getDb(), user.id, plan)) === null) {
    return Response.json({ error: "Das Tageslimit für KI-Anfragen ist erreicht. Morgen geht es weiter." }, { status: 429 });
  }
  try {
    const options = plan === "free" ? { models: FREE_PLAN_GRADING_MODELS, thinking: false } : undefined;
    const { title, areas, topics } = await planTopics(outline, focus, options);
    const studyPlan = schedulePlan({ title, areas, topics, today, examDate, hoursPerDay, daysPerWeek });
    // A new plan starts with nothing ticked off; the ids of its steps say nothing about the old one.
    await putStudyPlan(getDb(), user.id, studyPlan, { keepDone: false });
    return Response.json({ plan: studyPlan, done: [] });
  } catch (error) {
    await refundGenerateQuota(getDb(), user.id);
    return errorResponse(error);
  }
}
