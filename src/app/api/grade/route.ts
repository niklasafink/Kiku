import { z } from "zod";
import { errorResponse } from "@/lib/ai";
import { denyIfSignedOut } from "@/server/auth";
import { gradeAnswer } from "@/server/grade";

const MAX_CHARS = 8000;
// Spoken answers have no time limit; half an hour of speech is roughly 30,000 characters.
const MAX_ANSWER_CHARS = 40_000;

const requestSchema = z.object({
  question: z.string().max(MAX_CHARS),
  solution: z.string().trim().min(1).max(MAX_CHARS),
  answer: z.string().max(MAX_ANSWER_CHARS),
});

export async function POST(request: Request) {
  const denied = await denyIfSignedOut();
  if (denied) return denied;

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const { question, solution, answer } = parsed.data;

  try {
    return Response.json(await gradeAnswer(question, solution, answer));
  } catch (error) {
    return errorResponse(error);
  }
}
