import { SERVER_MODE } from "@/server/auth";
import { getDb } from "@/server/db";
import { getSharedDeck } from "@/server/shares";

/** Public: the content behind a share link. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!SERVER_MODE) return new Response(null, { status: 404 });
  const deck = await getSharedDeck(getDb(), (await params).token);
  if (!deck) return Response.json({ error: "Diesen Link gibt es nicht mehr." }, { status: 404 });
  return Response.json(deck);
}
