import { z } from "zod";
import { errorResponse, FREE_PLAN_GRADING_MODELS } from "@/lib/ai";
import { refundAi, takeAi } from "@/server/aiQuota";
import { planOrDeny } from "@/server/auth";
import { explainGaps } from "@/server/explain";

const requestSchema = z.object({
  question: z.string().max(20_000),
  answer: z.string().max(40_000),
  segments: z
    .array(z.object({ text: z.string(), status: z.enum(["correct", "missing", "unsure"]), note: z.string().optional() }))
    .min(1)
    .max(2000),
});

export async function POST(request: Request) {
  const plan = await planOrDeny();
  if (plan instanceof Response) return plan;

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const { question, answer, segments } = parsed.data;

  // An explanation counts like a grading: it is a second AI call of about the same size.
  const allowance = await takeAi(plan);
  if (allowance instanceof Response) return allowance;

  try {
    const options = plan === "free" ? { models: FREE_PLAN_GRADING_MODELS, thinking: false } : undefined;
    return Response.json({ text: await explainGaps(question, answer, segments, options) });
  } catch (error) {
    await refundAi(allowance);
    return errorResponse(error);
  }
}
