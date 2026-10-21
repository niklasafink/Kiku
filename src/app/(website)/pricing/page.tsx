import { notFound } from "next/navigation";
import { Pricing } from "../_components/Pricing";
import { JsonLd } from "../_components/JsonLd";
import { WebsiteFrame } from "../_components/WebsiteFrame";
import { PRICING_QUESTIONS } from "../_lib/faq";
import { pageMetadata, pricingJsonLd } from "../_lib/seo";
import { SERVER_MODE } from "@/server/auth";

export const metadata = pageMetadata({
  path: "/pricing",
  title: "Preise der Karteikarten-App Kiku: kostenlos, Pro, Einmalkauf",
  description:
    "Kiku kostenlos mit Konto, Pro für 4,99 € im Monat oder 29 € im Jahr, oder einmal kaufen für 49 €. Jeder Tarif mit KI-Abgleich deiner Antworten und Sync.",
});

export default function PricingPage() {
  // Plans belong to the hosted app; a local-only install has no accounts to sell them to.
  if (!SERVER_MODE) notFound();

  return (
    <WebsiteFrame>
      <JsonLd data={pricingJsonLd(PRICING_QUESTIONS)} />
      <Pricing />
    </WebsiteFrame>
  );
}
