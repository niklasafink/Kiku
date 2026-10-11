import { z } from "zod";
import { errorResponse, FREE_PLAN_GRADING_MODELS } from "@/lib/ai";
import { refundAi, takeAi } from "@/server/aiQuota";
import { planOrDeny } from "@/server/auth";
import { gradeAnswer } from "@/server/grade";

// As long as a card may be, see MAX_CARD_TEXT.
const MAX_CHARS = 20_000;
// Spoken answers have no time limit; half an hour of speech is roughly 30,000 characters.
const MAX_ANSWER_CHARS = 40_000;

const requestSchema = z.object({
  question: z.string().max(MAX_CHARS),
  solution: z.string().trim().min(1).max(MAX_CHARS),
  answer: z.string().max(MAX_ANSWER_CHARS),
  /** The folders the card lies in, e.g. "Steuerrecht › EStG". */
  context: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  const plan = await planOrDeny();
  if (plan instanceof Response) return plan;

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const { question, solution, answer, context } = parsed.data;

  const allowance = await takeAi(plan);
  if (allowance instanceof Response) return allowance;

  try {
    const options = plan === "free" ? { models: FREE_PLAN_GRADING_MODELS, thinking: false } : {};
    const graded = await gradeAnswer(question, solution, answer, { ...options, context });
    // The browser shows how much of the month is left once it gets scarce.
    return Response.json({ ...graded, remaining: allowance.remaining, limit: allowance.limit });
  } catch (error) {
    await refundAi(allowance);
    return errorResponse(error);
  }
}
