import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { getImage, IMAGE_TYPES, isImageId, MAX_IMAGE_BYTES, putImage } from "@/server/images";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  const image = isImageId(id) ? await getImage(getDb(), user.id, id) : null;
  if (!image) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(image.bytes), {
    // A picture never changes under its id, so the browser may keep it for good.
    headers: { "Content-Type": image.mime, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}

export async function PUT(request: Request, { params }: Context) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  const mime = request.headers.get("content-type") ?? "";
  if (!isImageId(id) || !IMAGE_TYPES.includes(mime)) {
    return Response.json({ error: "Ungültiges Bild." }, { status: 400 });
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) return Response.json({ error: "Ungültiges Bild." }, { status: 400 });
  if (bytes.byteLength > MAX_IMAGE_BYTES) return Response.json({ error: "Das Bild ist zu groß." }, { status: 413 });

  const result = await putImage(getDb(), user.id, { id, mime, bytes });
  if (result === "taken") return Response.json({ error: "Diese Kennung ist vergeben." }, { status: 409 });
  if (result === "full") return Response.json({ error: "Das Bilderlimit des Kontos ist erreicht." }, { status: 413 });
  return new Response(null, { status: result === "stored" ? 201 : 200 });
}
