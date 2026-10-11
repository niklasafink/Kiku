import { createNeonAuth } from "@neondatabase/auth/next/server";
import { planOf, type Plan } from "./plan";

/**
 * With a database and Neon Auth configured the app runs in server mode: accounts, sync and
 * the MCP endpoint are on, and the API requires a signed-in user. Without them it stays a
 * local-only app with no login, exactly as before.
 */
export const SERVER_MODE = Boolean(
  process.env.DATABASE_URL && process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET,
);

let instance: ReturnType<typeof createNeonAuth> | undefined;

export function getAuth() {
  if (!SERVER_MODE) throw new Error("Auth is not configured");
  instance ??= createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL!,
    cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
  });
  return instance;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
}

export async function currentUser(): Promise<CurrentUser | null> {
  const { data: session } = await getAuth().getSession();
  const user = session?.user;
  return user ? { id: user.id, email: user.email, name: user.name } : null;
}

/**
 * Asks Neon Auth whether this is the account's password, without touching the caller's session.
 * Null when Neon Auth could not be reached or answered with something unexpected.
 */
export async function passwordMatches(email: string, password: string, origin: string): Promise<boolean | null> {
  try {
    const response = await fetch(`${process.env.NEON_AUTH_BASE_URL}/sign-in/email`, {
      method: "POST",
      // Neon Auth only answers requests that name one of the app's own origins.
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ email, password }),
    });
    if (response.ok) return true;
    return response.status === 401 || response.status === 400 ? false : null;
  } catch {
    return null;
  }
}

const UNAUTHORIZED = () => Response.json({ error: "Bitte melde dich an." }, { status: 401 });

/** For routes that only exist in server mode. Returns the user, or the response to send instead. */
export async function requireUser(): Promise<CurrentUser | Response> {
  if (!SERVER_MODE) return Response.json({ error: "Not available in local mode." }, { status: 404 });
  return (await currentUser()) ?? UNAUTHORIZED();
}

/**
 * For routes that also work in local mode (AI calls): the caller's plan, or the response to send
 * instead. Locally the operator's own key pays, so everything is on; on a server only for signed-in users.
 */
export async function planOrDeny(): Promise<Plan | Response> {
  if (!SERVER_MODE) return "paid";
  const user = await currentUser();
  return user ? planOf(user) : UNAUTHORIZED();
}
