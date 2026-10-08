import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { deleteToken } from "@/server/tokens";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  await deleteToken(getDb(), user.id, (await params).id);
  return new Response(null, { status: 204 });
}
