import { getAuth, SERVER_MODE } from "@/server/auth";

type Handler = (request: Request, context: { params: Promise<{ path: string[] }> }) => Promise<Response>;

// Forwards to Neon Auth. Resolved per request so the app still builds and runs without it.
const forward =
  (method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"): Handler =>
  (request, context) =>
    SERVER_MODE ? getAuth().handler()[method](request, context) : Promise.resolve(new Response(null, { status: 404 }));

export const GET = forward("GET");
export const POST = forward("POST");
export const PUT = forward("PUT");
export const DELETE = forward("DELETE");
export const PATCH = forward("PATCH");
