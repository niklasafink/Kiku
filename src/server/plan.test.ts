import { afterEach, describe, expect, it, vi } from "vitest";
import { planOf } from "./plan";

const user = (email: string) => ({ email });

afterEach(() => vi.unstubAllEnvs());

describe("planOf", () => {
  it("puts everyone on the free plan by default", () => {
    vi.stubEnv("PAID_EMAILS", "");
    expect(planOf(user("a@example.com"))).toBe("free");
  });

  it("treats listed addresses as paid, ignoring case and spaces", () => {
    vi.stubEnv("PAID_EMAILS", "a@example.com, B@Example.com");
    expect(planOf(user("A@example.com"))).toBe("paid");
    expect(planOf(user("b@example.com"))).toBe("paid");
    expect(planOf(user("c@example.com"))).toBe("free");
  });

  it("puts addresses listed as unlimited above the paid plan", () => {
    vi.stubEnv("PAID_EMAILS", "a@example.com");
    vi.stubEnv("UNLIMITED_EMAILS", "A@example.com, b@example.com");
    expect(planOf(user("a@example.com"))).toBe("unlimited");
    expect(planOf(user("b@example.com"))).toBe("unlimited");
    expect(planOf(user("c@example.com"))).toBe("free");
  });
});
