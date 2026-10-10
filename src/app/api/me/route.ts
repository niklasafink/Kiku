import { currentUser, SERVER_MODE } from "@/server/auth";
import { getDb } from "@/server/db";
import { planOf } from "@/server/plan";
import { AI_LIMITS, remainingQuota } from "@/server/quota";

export async function GET() {
  if (!SERVER_MODE) return Response.json({ user: null });
  const user = await currentUser();
  if (!user) return Response.json({ user: null });
  const plan = planOf(user);
  // How many gradings the month still has, shown in the settings.
  const ai = { remaining: await remainingQuota(getDb(), "ai", user.id, plan), limit: AI_LIMITS[plan] };
  return Response.json({ user: { ...user, plan, ai } });
}
