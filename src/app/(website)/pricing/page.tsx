import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Pricing } from "../_components/Pricing";
import { WebsiteFrame } from "../_components/WebsiteFrame";
import { SERVER_MODE } from "@/server/auth";

export const metadata: Metadata = {
  title: "Preise · Kiku",
  description: "Kostenlos mit Konto oder selbst gehostet, Pro für 4,99 € im Monat oder 29 € im Jahr, oder einmal kaufen für 49 €.",
};

export default function PricingPage() {
  // Plans belong to the hosted app; a local-only install has no accounts to sell them to.
  if (!SERVER_MODE) notFound();

  return (
    <WebsiteFrame>
      <Pricing />
    </WebsiteFrame>
  );
}
