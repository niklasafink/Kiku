import { currentUser, SERVER_MODE } from "@/server/auth";

export async function GET() {
  if (!SERVER_MODE) return Response.json({ user: null });
  return Response.json({ user: await currentUser() });
}
