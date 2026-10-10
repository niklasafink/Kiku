import { z } from "zod";
import { errorResponse } from "@/lib/ai";
import { findDemoCard } from "../../../_lib/demoCards";
import { SERVER_MODE } from "@/server/auth";
import { getDb } from "@/server/db";
import { clientIp, demoQuotaLeft, refundDemoQuota, takeDemoQuota } from "@/server/demo";
import { gradeAnswer } from "@/server/grade";

// Only the demo cards can be graded here, so the endpoint is of no use as a free AI proxy.
const requestSchema = z.object({
  cardId: z.string().max(100),
  answer: z.string().trim().min(1).max(4000),
});

const NOT_AVAILABLE = () => Response.json({ error: "Not available in local mode." }, { status: 404 });

/** How many demo answers this visitor has left today. */
export async function GET(request: Request) {
  if (!SERVER_MODE) return NOT_AVAILABLE();
  return Response.json({ remaining: await demoQuotaLeft(getDb(), "grade", clientIp(request)) });
}

export async function POST(request: Request) {
  if (!SERVER_MODE) return NOT_AVAILABLE();

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  const card = parsed.success ? findDemoCard(parsed.data.cardId) : undefined;
  if (!parsed.success || !card) {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const db = getDb();
  const ip = clientIp(request);
  const remaining = await takeDemoQuota(db, "grade", ip);
  if (remaining === null) {
    return Response.json(
      { error: "Du hast heute schon alle Probe-Antworten genutzt. Mit einem Konto geht es weiter.", remaining: 0 },
      { status: 429 },
    );
  }

  try {
    const result = await gradeAnswer(card.question, card.solution, parsed.data.answer);
    return Response.json({ ...result, remaining });
  } catch (error) {
    await refundDemoQuota(db, "grade", ip).catch(() => {});
    return errorResponse(error);
  }
}
