import { currentUser, SERVER_MODE } from "@/server/auth";
import { getDb } from "@/server/db";
import { planOf } from "@/server/plan";
import { AI_LIMITS, remainingQuota } from "@/server/quota";
import { hasStudyPlan } from "@/server/studyPlan";

export async function GET() {
  if (!SERVER_MODE) return Response.json({ user: null });
  const user = await currentUser();
  if (!user) return Response.json({ user: null });
  const plan = planOf(user);
  // How many gradings the month still has, shown in the settings.
  // The admin is not counted and has no number to show.
  const ai =
    plan === "admin"
      ? undefined
      : { remaining: await remainingQuota(getDb(), "ai", user.id, plan), limit: AI_LIMITS[plan] };
  // Only accounts with a study plan get the link to it in the sidebar.
  const studyPlan = await hasStudyPlan(getDb(), user.id);
  return Response.json({ user: { ...user, plan, ai, hasStudyPlan: studyPlan } });
}
