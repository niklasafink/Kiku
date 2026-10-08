import { SERVER_MODE } from "@/server/auth";
import { getDb } from "@/server/db";
import { handleMcpRequest } from "@/server/mcp";

function handle(request: Request): Promise<Response> {
  if (!SERVER_MODE) return Promise.resolve(new Response(null, { status: 404 }));
  return handleMcpRequest(getDb(), request);
}

export { handle as GET, handle as POST, handle as DELETE };
