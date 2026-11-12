/** Free accounts get free and very cheap models and transcribe in the browser; paid ones the full models. */
export type Plan = "free" | "paid" | "admin";
/** The plans users can be on. The admin runs the app: everything of the paid plan and no limits. */
export type LimitedPlan = Exclude<Plan, "admin">;

// There is no billing yet: an account is paid when its e-mail address is listed (comma-separated).
// ADMIN_EMAILS names whoever runs the app; it is not a plan anyone can get.
// An entry of PAID_EMAILS may name a budget after a colon, in US dollars per calendar month as OpenRouter
// bills them: "a@example.com:5". A budget that is no number counts as none left.
const entries = (list: string | undefined) =>
  new Map(
    (list ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
      .map((entry): [string, number | null] => {
        const [email, budget] = entry.split(":");
        const usd = Number(budget);
        return [email.trim(), budget === undefined ? null : Number.isFinite(usd) ? usd : 0];
      }),
  );

export function planOf(user: { email: string }): Plan {
  const email = user.email.toLowerCase();
  if (entries(process.env.ADMIN_EMAILS).has(email)) return "admin";
  return entries(process.env.PAID_EMAILS).has(email) ? "paid" : "free";
}

/** What a paid account may cost per calendar month in US dollars, or null without a budget. See `planFor`. */
export function budgetOf(user: { email: string }): number | null {
  return entries(process.env.PAID_EMAILS).get(user.email.toLowerCase()) ?? null;
}
