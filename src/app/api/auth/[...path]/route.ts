import { after } from "next/server";
import { getAuth, SERVER_MODE } from "@/server/auth";
import { notifySignUp } from "@/server/notify";

type Handler = (request: Request, context: { params: Promise<{ path: string[] }> }) => Promise<Response>;

// Forwards to Neon Auth. Resolved per request so the app still builds and runs without it.
const forward =
  (method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"): Handler =>
  async (request, context) => {
    if (!SERVER_MODE) return new Response(null, { status: 404 });
    const response = await getAuth().handler()[method](request, context);
    if (method === "POST" && response.ok && new URL(request.url).pathname.endsWith("/sign-up/email")) {
      // Sent after the response, so a slow or failing notification never holds up the sign-up.
      const copy = response.clone();
      after(() => notifySignUp(copy));
    }
    return response;
  };

export const GET = forward("GET");
export const POST = forward("POST");
export const PUT = forward("PUT");
export const DELETE = forward("DELETE");
export const PATCH = forward("PATCH");
