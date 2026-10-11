// Tells the operator about new accounts and purchase requests through a Telegram bot.
// Off unless both variables are set.
import { OFFERS, type Offer } from "@/lib/offers";

/** Sends the message to the operator's chat. Never throws. */
async function send(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
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

const who = (user: { email: string; name?: string }) => `${user.name ? `${user.name} · ` : ""}${user.email}`;

/** Reads the new user out of a successful sign-up response and sends the message. Never throws. */
export async function notifySignUp(response: Response): Promise<void> {
  const body = (await response.json().catch(() => null)) as { user?: { email?: string; name?: string } } | null;
  const user = body?.user;
  if (!user?.email) return;
  await send(`Neue Registrierung bei Kiku\n${who({ email: user.email, name: user.name })}`);
}

/** Someone asked to buy: who to write to and which offer they chose. Never throws. */
export async function notifyPurchaseRequest(user: { email: string; name?: string }, offer: Offer): Promise<void> {
  await send(`Kaufanfrage bei Kiku\n${who(user)}\n${OFFERS[offer]}`);
}
