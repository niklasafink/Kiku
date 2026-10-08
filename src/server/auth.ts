import { createNeonAuth } from "@neondatabase/auth/next/server";

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

const UNAUTHORIZED = () => Response.json({ error: "Bitte melde dich an." }, { status: 401 });

/** For routes that only exist in server mode. Returns the user, or the response to send instead. */
export async function requireUser(): Promise<CurrentUser | Response> {
  if (!SERVER_MODE) return Response.json({ error: "Not available in local mode." }, { status: 404 });
  return (await currentUser()) ?? UNAUTHORIZED();
}

/** For routes that also work in local mode (AI calls): open locally, signed-in users only on a server. */
export async function denyIfSignedOut(): Promise<Response | null> {
  if (!SERVER_MODE) return null;
  return (await currentUser()) ? null : UNAUTHORIZED();
}
