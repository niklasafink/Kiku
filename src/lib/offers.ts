// What the pricing page sells, as named in the link to the purchase page and in a purchase request.
// Prices are repeated from the pricing page (Pricing.tsx); change both together.
export const OFFERS = {
  "pro-monthly": "Pro, 4,99 € im Monat",
  "pro-yearly": "Pro, 29 € im Jahr",
  lifetime: "Einmalkauf, 49 €",
} as const;

export type Offer = keyof typeof OFFERS;

export const isOffer = (value: unknown): value is Offer => typeof value === "string" && Object.hasOwn(OFFERS, value);

/** The page that takes the purchase request. Visitors pass the sign-up on their way there. */
export const purchasePath = (offer: Offer) => `/kaufen?tarif=${offer}`;

/** A path inside the app to continue with after signing in; anything else (other sites) is dropped. */
export function returnPath(value: string | null | undefined): string | null {
  return value && /^\/(?![/\\])/.test(value) ? value : null;
}
