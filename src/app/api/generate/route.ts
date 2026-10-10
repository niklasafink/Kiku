import { z } from "zod";
import { errorResponse, FREE_PLAN_GRADING_MODELS } from "@/lib/ai";
import { GENERATE_CHUNK_CHARS } from "@/lib/chunks";
import { currentUser, planOrDeny, SERVER_MODE } from "@/server/auth";
import { getDb } from "@/server/db";
import { generateCards } from "@/server/generate";
import { refundGenerateQuota, takeGenerateQuota } from "@/server/quota";

const requestSchema = z.object({
  text: z.string().trim().min(1).max(GENERATE_CHUNK_CHARS + 2000),
  focus: z.string().trim().max(300).default(""),
});

export async function POST(request: Request) {
  const plan = await planOrDeny();
  if (plan instanceof Response) return plan;

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const { text, focus } = parsed.data;

  // Without accounts the operator's own key pays and nothing is counted.
  const user = SERVER_MODE ? await currentUser() : null;
  if (user && (await takeGenerateQuota(getDb(), user.id, plan)) === null) {
    return Response.json(
      {
        error:
          plan === "free"
            ? "Das Tageslimit für KI-Karten im kostenlosen Tarif ist erreicht. Morgen geht es weiter, mit Pro sofort."
            : "Das Tageslimit für KI-Karten ist erreicht. Morgen geht es weiter.",
      },
      { status: 429 },
    );
  }

  try {
    const options = plan === "free" ? { models: FREE_PLAN_GRADING_MODELS, thinking: false } : undefined;
    return Response.json({ cards: await generateCards(text, focus, options) });
  } catch (error) {
    if (user) await refundGenerateQuota(getDb(), user.id);
    return errorResponse(error);
  }
}
