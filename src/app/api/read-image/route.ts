import { errorResponse } from "@/lib/ai";
import { currentUser, planOrDeny, SERVER_MODE } from "@/server/auth";
import { getDb } from "@/server/db";
import { refundQuota, takeQuota } from "@/server/quota";
import { readImageText, type ImageKind } from "@/server/readImage";

// The browser scales pictures down before sending; this stays below typical 4.5 MB body limits.
const MAX_BYTES = 4_000_000;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Reads the text in a picture: ?kind=handwriting for a written answer, ?kind=document for a page of material. */
export async function POST(request: Request) {
  const plan = await planOrDeny();
  if (plan instanceof Response) return plan;

  const kind: ImageKind = new URL(request.url).searchParams.get("kind") === "document" ? "document" : "handwriting";
  const mediaType = request.headers.get("content-type") ?? "";
  if (!TYPES.includes(mediaType)) return Response.json({ error: "Ungültiges Bild." }, { status: 400 });
  const image = new Uint8Array(await request.arrayBuffer());
  if (image.byteLength === 0) return Response.json({ error: "Kein Bild erhalten." }, { status: 400 });
  if (image.byteLength > MAX_BYTES) return Response.json({ error: "Das Bild ist zu groß." }, { status: 413 });

  // Without accounts the operator's own key pays and nothing is counted.
  const user = SERVER_MODE ? await currentUser() : null;
  if (user && (await takeQuota(getDb(), "image", user.id, plan)) === null) {
    return Response.json(
      {
        error:
          plan === "free"
            ? "Das Tageslimit für Handschrift und gescannte Seiten im kostenlosen Tarif ist erreicht. Morgen geht es weiter, mit Pro sofort."
            : "Das Tageslimit für Handschrift und gescannte Seiten ist erreicht. Morgen geht es weiter.",
      },
      { status: 429 },
    );
  }

  try {
    return Response.json({ text: await readImageText(image, mediaType, kind) });
  } catch (error) {
    if (user) await refundQuota(getDb(), "image", user.id);
    return errorResponse(error);
  }
}
