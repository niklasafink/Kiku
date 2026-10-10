import { currentUser, SERVER_MODE } from "@/server/auth";
import { planOf } from "@/server/plan";

export async function GET() {
  if (!SERVER_MODE) return Response.json({ user: null });
  const user = await currentUser();
  return Response.json({ user: user && { ...user, plan: planOf(user) } });
}
