import { SERVER_MODE } from "@/server/auth";
import { getDb } from "@/server/db";
import { isImageId } from "@/server/images";
import { getSharedImage } from "@/server/shares";

/** Public: a picture shown by a card of a shared deck. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  if (!SERVER_MODE) return new Response(null, { status: 404 });
  const { token, id } = await params;
  const image = isImageId(id) ? await getSharedImage(getDb(), token, id) : null;
  if (!image) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(image.bytes), {
    headers: { "Content-Type": image.mime, "Cache-Control": "public, max-age=86400" },
  });
}
