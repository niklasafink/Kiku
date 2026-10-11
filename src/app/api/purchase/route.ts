import { after } from "next/server";
import { z } from "zod";
import { OFFERS, type Offer } from "@/lib/offers";
import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { notifyPurchaseRequest } from "@/server/notify";
import { requestPurchase } from "@/server/purchase";

const body = z.object({ offer: z.enum(Object.keys(OFFERS) as [Offer, ...Offer[]]) });

/** Notes that the signed-in account wants to buy an offer and tells the operator about it. */
export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const { offer } = parsed.data;
  // The page sends the request each time it is opened; only news is worth a message.
  if (await requestPurchase(getDb(), user, offer)) after(() => notifyPurchaseRequest(user, offer));
  return new Response(null, { status: 204 });
}
