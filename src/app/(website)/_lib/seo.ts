import type { Metadata } from "next";

/*
 * What search engines and link previews read about the website: addresses, the shared
 * Open Graph fields and the structured data (JSON-LD) of the public pages.
 */

export const SITE_URL = "https://kikucards.de";
const SITE_NAME = "Kiku";
const OPERATOR = "Dealzforest UG (haftungsbeschränkt)";

// The preview picture next to the root layout. Named here because a page that sets its own Open
// Graph fields no longer inherits it below the root.
const PREVIEW_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "kiku – Karteikarten lernen mit KI-Abgleich" };

/** Title, description, canonical address and Open Graph of one public page. */
export function pageMetadata({ path, title, description }: { path: string; title: string; description: string }): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: { index: true, follow: true },
    openGraph: { type: "website", siteName: SITE_NAME, locale: "de_DE", url: path, title, description, images: [PREVIEW_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [PREVIEW_IMAGE.url] },
  };
}

/** Pages that must stay reachable but have no place in search results, such as the legal ones. */
export const NOINDEX: Metadata["robots"] = { index: false, follow: true };

const ORGANIZATION = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: OPERATOR,
  url: SITE_URL,
  logo: `${SITE_URL}/icons/icon-512.png`,
  email: "info@dealzforest.com",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Europa-Allee 49",
    postalCode: "60327",
    addressLocality: "Frankfurt am Main",
    addressCountry: "DE",
  },
};

const WEBSITE = {
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  url: SITE_URL,
  name: SITE_NAME,
  inLanguage: "de-DE",
  publisher: { "@id": `${SITE_URL}/#organization` },
};

const OFFERS = [
  { name: "Kostenlos", price: "0" },
  { name: "Pro monatlich", price: "4.99" },
  { name: "Pro jährlich", price: "29" },
  { name: "Einmalkauf", price: "49" },
].map((offer) => ({
  "@type": "Offer",
  ...offer,
  priceCurrency: "EUR",
  url: `${SITE_URL}/pricing`,
  availability: "https://schema.org/InStock",
}));

const APPLICATION = {
  "@type": "WebApplication",
  "@id": `${SITE_URL}/#app`,
  name: SITE_NAME,
  url: SITE_URL,
  description:
    "Karteikarten-App für Active Recall: Du sprichst oder tippst deine Antwort, die KI gleicht sie Satz für Satz mit deiner eigenen Lösung ab.",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web, iPadOS, iOS, Android, macOS, Windows",
  browserRequirements: "Ein aktueller Browser",
  inLanguage: "de-DE",
  image: `${SITE_URL}/opengraph-image`,
  publisher: { "@id": `${SITE_URL}/#organization` },
  offers: OFFERS,
};

type Question = { question: string; answer: string };

function faqPage(path: string, questions: Question[]) {
  return {
    "@type": "FAQPage",
    "@id": `${SITE_URL}${path}#faq`,
    mainEntity: questions.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

function breadcrumbs(items: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

export function homeJsonLd(questions: Question[]) {
  return { "@context": "https://schema.org", "@graph": [ORGANIZATION, WEBSITE, APPLICATION, faqPage("/", questions)] };
}

export function pricingJsonLd(questions: Question[]) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      ORGANIZATION,
      WEBSITE,
      APPLICATION,
      faqPage("/pricing", questions),
      breadcrumbs([
        { name: "Kiku", path: "/" },
        { name: "Preise", path: "/pricing" },
      ]),
    ],
  };
}
