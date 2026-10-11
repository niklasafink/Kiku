// The monthly allowance of gradings and explanations, shared by the two routes that use it.
import { AI_LIMITS, refundQuota, takeQuota } from "./quota";
import { currentUser, SERVER_MODE } from "./auth";
import { getDb } from "./db";
import type { Plan } from "./plan";

/** First day of next month, when the counter starts again. */
function nextReset(now = new Date()): string {
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return first.toLocaleDateString("de-DE", { day: "numeric", month: "long", timeZone: "UTC" });
}

export interface AiAllowance {
  /** Null without accounts and for unlimited accounts: nothing is counted. */
  userId: string | null;
  /** What is left after this request; null when nothing is counted. */
  remaining: number | null;
  limit: number | null;
}

/**
 * Takes one grading of the month. Returns the allowance, or the response to send when it is
 * used up. Call `refundAi` if the AI call behind it fails.
 */
export async function takeAi(plan: Plan): Promise<AiAllowance | Response> {
  const user = SERVER_MODE ? await currentUser() : null;
  if (!user || plan === "unlimited") return { userId: null, remaining: null, limit: null };
  const remaining = await takeQuota(getDb(), "ai", user.id, plan);
  if (remaining === null) {
    return Response.json(
      {
        error:
          plan === "free"
            ? `Die ${AI_LIMITS.free} KI-Auswertungen des kostenlosen Tarifs für diesen Monat sind aufgebraucht. Ab ${nextReset()} geht es weiter. Mit „Lösung zeigen“ kannst du dich weiter selbst prüfen.`
            : `Die ${AI_LIMITS.paid} KI-Auswertungen dieses Monats sind aufgebraucht. Ab ${nextReset()} geht es weiter. Mit „Lösung zeigen“ kannst du dich weiter selbst prüfen.`,
      },
      { status: 429 },
    );
  }
  return { userId: user.id, remaining, limit: AI_LIMITS[plan] };
}

export async function refundAi(allowance: AiAllowance): Promise<void> {
  if (allowance.userId) await refundQuota(getDb(), "ai", allowance.userId);
}
