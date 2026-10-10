/** Free accounts get free and very cheap models and transcribe in the browser; paid ones the full models. */
export type Plan = "free" | "paid";

// There is no billing yet: an account is paid when its e-mail address is listed here (comma-separated).
const paidEmails = () =>
  new Set((process.env.PAID_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));

export function planOf(user: { email: string }): Plan {
  return paidEmails().has(user.email.toLowerCase()) ? "paid" : "free";
}
