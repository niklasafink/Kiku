// The tax law knowledge base (WP-Examen Steuerrecht), a separate MCP server run by the operator.
// Only the admin's tandem uses it. The server signs in with OAuth like any connector; Kiku plays
// both the client and the user at its login page, so no browser and no manual step is needed.
import { createHash, randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const REDIRECT = "http://localhost/kiku-tandem";

interface Config {
  base: string;
  /** Without them the server is one running locally without a login. */
  user?: string;
  password?: string;
}

function config(): Config | null {
  const url = process.env.STEUERRECHT_MCP_URL;
  if (!url) return null;
  const { STEUERRECHT_MCP_USER: user, STEUERRECHT_MCP_PASSWORD: password } = process.env;
  return { base: url.replace(/\/mcp\/?$/, "").replace(/\/$/, ""), user, password };
}

export const steuerrechtAvailable = () => config() !== null;

interface Tokens {
  access: string;
  refresh: string | null;
  /** Milliseconds; renewed a minute early. */
  expires: number;
}

// Kept per instance: a cold instance signs in once, warm ones reuse the token.
let client: { id: string; secret: string | undefined } | null = null;
let tokens: Tokens | null = null;
let pending: Promise<string> | null = null;

const base64url = (bytes: Buffer) => bytes.toString("base64url");

function store(data: { access_token: string; refresh_token?: string; expires_in?: number }) {
  tokens = {
    access: data.access_token,
    refresh: data.refresh_token ?? null,
    expires: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000,
  };
  return tokens.access;
}

async function tokenRequest({ base }: Config, body: Record<string, string>) {
  const response = await fetch(`${base}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: client!.id, ...(client!.secret ? { client_secret: client!.secret } : {}), ...body }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Token request failed (${response.status})`);
  return response.json();
}

/** The whole authorization code flow: register, authorize, fill in the login page, exchange the code. */
async function signIn(cfg: Config): Promise<string> {
  const timeout = () => AbortSignal.timeout(8_000);
  if (!client) {
    const response = await fetch(`${cfg.base}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Kiku Lerntandem",
        redirect_uris: [REDIRECT],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "client_secret_post",
      }),
      signal: timeout(),
    });
    if (!response.ok) throw new Error(`Client registration failed (${response.status})`);
    const data = (await response.json()) as { client_id: string; client_secret?: string };
    client = { id: data.client_id, secret: data.client_secret };
  }

  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const authorize = new URL(`${cfg.base}/authorize`);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: client.id,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: base64url(randomBytes(12)),
    resource: `${cfg.base}/mcp`,
  }).toString();
  const toLogin = await fetch(authorize, { redirect: "manual", signal: timeout() });
  const loginUrl = toLogin.headers.get("location");
  if (!loginUrl) {
    // The registration is gone, e.g. after the server's database was reset.
    client = null;
    throw new Error(`Authorization failed (${toLogin.status})`);
  }
  const page = await (await fetch(new URL(loginUrl, cfg.base), { signal: timeout() })).text();
  const field = (name: string) => page.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`))?.[1] ?? "";
  const login = await fetch(`${cfg.base}/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ txn: field("txn"), csrf: field("csrf"), name: cfg.user!, passwort: cfg.password! }),
    signal: timeout(),
  });
  const code = new URL(login.headers.get("location") ?? "", REDIRECT).searchParams.get("code");
  if (!code) throw new Error(`Login failed (${login.status})`);
  return store(
    await tokenRequest(cfg, { grant_type: "authorization_code", code, redirect_uri: REDIRECT, code_verifier: verifier }),
  );
}

async function accessToken(cfg: Config, fresh = false): Promise<string> {
  if (!fresh && tokens && tokens.expires > Date.now()) return tokens.access;
  pending ??= (async () => {
    try {
      if (!fresh && tokens?.refresh && client) {
        try {
          return store(await tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: tokens.refresh }));
        } catch {
          // Signing in again always works while the password is right.
        }
      }
      tokens = null;
      return await signIn(cfg);
    } finally {
      pending = null;
    }
  })();
  return pending;
}

async function connect(cfg: Config, fresh: boolean): Promise<Client> {
  const headers: Record<string, string> = cfg.password ? { Authorization: `Bearer ${await accessToken(cfg, fresh)}` } : {};
  const mcp = new Client({ name: "kiku-tandem", version: "1.0.0" });
  await mcp.connect(new StreamableHTTPClientTransport(new URL(`${cfg.base}/mcp`), { requestInit: { headers } }));
  return mcp;
}

/** Calls one tool of the knowledge base and returns its text. Throws if the server cannot be reached. */
export async function callSteuerrecht(tool: string, args: Record<string, unknown>): Promise<string> {
  const cfg = config();
  if (!cfg) throw new Error("The tax law knowledge base is not configured.");
  let mcp: Client;
  try {
    mcp = await connect(cfg, false);
  } catch {
    // An access token the server no longer knows: sign in again once.
    mcp = await connect(cfg, true);
  }
  try {
    const result = await mcp.callTool({ name: tool, arguments: args }, undefined, { timeout: 8_000 });
    const content = (result.content ?? []) as { type: string; text?: string }[];
    return content.map((part) => (part.type === "text" ? (part.text ?? "") : "")).join("\n");
  } finally {
    void mcp.close().catch(() => {});
  }
}

// Sections of a recherche() package worth reading in a spoken conversation, with how much of each.
// The full package runs to 70,000 characters; the theme card, the model solution and the norms carry the answer.
const PACKAGE_PARTS: [RegExp, number][] = [
  [/^## A\. /, 1_500],
  [/^## B\. /, 9_000],
  [/^## C\. /, 7_000],
  [/^## D\. /, 5_000],
  [/^## E\. /, 4_000],
];

/** Cuts a recherche() package down to what a quick, well-founded answer needs. */
export function trimPackage(text: string): string {
  const sections = text.split(/\n(?=## [A-Z]\d?\. )/);
  const kept = sections.flatMap((section) => {
    const limit = PACKAGE_PARTS.find(([start]) => start.test(section))?.[1];
    if (!limit) return [];
    return [section.length > limit ? `${section.slice(0, limit)}\n[… gekürzt]` : section];
  });
  return kept.length ? kept.join("\n\n") : text.slice(0, 20_000);
}
