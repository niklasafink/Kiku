/** Free accounts get free and very cheap models and transcribe in the browser; paid ones the full models. */
export type Plan = "free" | "paid" | "admin";
/** The plans users can be on. The admin runs the app: everything of the paid plan and no limits. */
export type LimitedPlan = Exclude<Plan, "admin">;

// There is no billing yet: an account is paid when its e-mail address is listed (comma-separated).
// ADMIN_EMAILS names whoever runs the app; it is not a plan anyone can get.
const emails = (list: string | undefined) =>
  new Set((list ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));

export function planOf(user: { email: string }): Plan {
  const email = user.email.toLowerCase();
  if (emails(process.env.ADMIN_EMAILS).has(email)) return "admin";
  return emails(process.env.PAID_EMAILS).has(email) ? "paid" : "free";
}
