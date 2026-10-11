import { describe, expect, it } from "vitest";
import { isOffer, returnPath } from "./offers";

describe("isOffer", () => {
  it("knows the offers of the pricing page and nothing else", () => {
    expect(isOffer("pro-yearly")).toBe(true);
    expect(isOffer("toString")).toBe(false);
    expect(isOffer(undefined)).toBe(false);
  });
});

describe("returnPath", () => {
  it("keeps paths inside the app", () => {
    expect(returnPath("/kaufen?tarif=lifetime")).toBe("/kaufen?tarif=lifetime");
  });

  it("drops other sites and missing values", () => {
    for (const value of ["https://example.com", "//example.com", "/\\example.com", "kaufen", "", null]) {
      expect(returnPath(value)).toBeNull();
    }
  });
});
