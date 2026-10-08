// Tells the operator about new accounts through a Telegram bot. Off unless both variables are set.

/** Reads the new user out of a successful sign-up response and sends the message. Never throws. */
export async function notifySignUp(response: Response): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    const body = (await response.json().catch(() => null)) as { user?: { email?: string; name?: string } } | null;
    const user = body?.user;
    if (!user?.email) return;

    const text = `Neue Registrierung bei Kiku\n${user.name ? `${user.name} · ` : ""}${user.email}`;
    const sent = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!sent.ok) console.error("Telegram notification failed:", sent.status, await sent.text());
  } catch (error) {
    console.error("Telegram notification failed:", error);
  }
}
