/** Free accounts get free and very cheap models and transcribe in the browser; paid ones the full models. */
export type Plan = "free" | "paid" | "unlimited";
/** The plans whose use is counted. Unlimited accounts get everything of the paid plan and no limits. */
export type LimitedPlan = Exclude<Plan, "unlimited">;

// There is no billing yet: an account is paid or unlimited when its e-mail address is listed (comma-separated).
const emails = (list: string | undefined) =>
  new Set((list ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));

export function planOf(user: { email: string }): Plan {
  const email = user.email.toLowerCase();
  if (emails(process.env.UNLIMITED_EMAILS).has(email)) return "unlimited";
  return emails(process.env.PAID_EMAILS).has(email) ? "paid" : "free";
}
