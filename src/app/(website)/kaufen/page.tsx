import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PurchaseRequest } from "../_components/PurchaseRequest";
import { WebsiteFrame } from "../_components/WebsiteFrame";
import { isOffer, purchasePath } from "@/lib/offers";
import { currentUser, SERVER_MODE } from "@/server/auth";

export const metadata: Metadata = { title: "Kaufen | Kiku", robots: { index: false } };

/** Where the buttons of the pricing page lead: ?tarif= names the offer. */
export default async function PurchasePage({ searchParams }: { searchParams: Promise<{ tarif?: string | string[] }> }) {
  if (!SERVER_MODE) notFound();
  const { tarif } = await searchParams;
  if (!isOffer(tarif)) redirect("/pricing");

  // Buying needs an account: it is how the operator knows who to write to.
  const user = await currentUser();
  if (!user) redirect(`/auth/sign-up?next=${encodeURIComponent(purchasePath(tarif))}`);

  return (
    <WebsiteFrame>
      <PurchaseRequest offer={tarif} email={user.email} />
    </WebsiteFrame>
  );
}
