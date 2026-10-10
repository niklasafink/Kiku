// The MCP server: lets an assistant such as Claude work on one user's library.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import type { Database } from "./db";
import * as library from "./library";
import { userForToken } from "./tokens";

const READ = { readOnlyHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false };
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true };

export function createMcpServer(db: Database, userId: string): McpServer {
  const server = new McpServer({ name: "kiku", version: "1.0.0" });

  // Known problems (unknown id, invalid move) go back to the assistant as a tool error it can act on.
  const run = async (action: () => Promise<unknown>) => {
    try {
      return { content: [{ type: "text" as const, text: JSON.stringify(await action(), null, 2) }] };
    } catch (error) {
      if (!(error instanceof library.LibraryError)) throw error;
      return { content: [{ type: "text" as const, text: error.message }], isError: true };
    }
  };

  server.registerTool(
    "get_overview",
    {
      description:
        "Folder tree of the flashcard library with full paths and card counts. Call this first to find folder ids.",
      annotations: READ,
    },
    () => run(() => library.overview(db, userId)),
  );

  server.registerTool(
    "list_cards",
    {
      description:
        "Cards with question, solution, number of attempts and the score (0-100) of the last attempt. Filter by folder and/or search text. lastScore null means never practised.",
      inputSchema: {
        folderId: z.string().optional().describe("Only cards in this folder"),
        includeSubfolders: z.boolean().default(true),
        query: z.string().optional().describe("Text to search for in questions and solutions"),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      },
      annotations: READ,
    },
    (args) => run(() => library.listCards(db, userId, args)),
  );

  server.registerTool(
    "get_card",
    {
      description:
        "One card with its last 20 attempts. Each attempt has the student's answer and the solution split into segments marked correct, missing or unsure.",
      inputSchema: { cardId: z.string() },
      annotations: READ,
    },
    ({ cardId }) => run(() => library.getCard(db, userId, cardId)),
  );

  server.registerTool(
    "create_folder",
    {
      description: "Create a folder. Omit parentId for a top-level folder.",
      inputSchema: {
        name: z.string().min(1).max(80),
        emoji: z.string().max(8).optional().describe("A single emoji shown as the folder icon"),
        parentId: z.string().optional(),
      },
      annotations: WRITE,
    },
    (args) => run(() => library.createFolder(db, userId, args)),
  );

  server.registerTool(
    "update_folder",
    {
      description:
        "Rename a folder, change its emoji, or move it. Set parentId to another folder id to move it there, or to null to make it top-level.",
      inputSchema: {
        folderId: z.string(),
        name: z.string().min(1).max(80).optional(),
        emoji: z.string().max(8).optional(),
        parentId: z.string().nullable().optional(),
      },
      annotations: WRITE,
    },
    ({ folderId, ...patch }) => run(() => library.updateFolder(db, userId, folderId, patch)),
  );

  server.registerTool(
    "delete_folder",
    {
      description:
        "Permanently delete a folder with ALL its subfolders, cards and learning history. Cannot be undone; confirm with the user first.",
      inputSchema: { folderId: z.string() },
      annotations: DESTRUCTIVE,
    },
    ({ folderId }) => run(() => library.deleteFolder(db, userId, folderId)),
  );

  server.registerTool(
    "create_cards",
    {
      description:
        "Add one or more flashcards to a folder. The solution is the model answer the student's spoken or typed answer is later compared with, so write it as complete statements. Both texts may use Markdown: **bold**, *italic*, ==marked==, lists, headings and tables.",
      inputSchema: {
        folderId: z.string(),
        cards: z
          .array(z.object({ question: z.string().min(1).max(20_000), solution: z.string().min(1).max(20_000) }))
          .min(1)
          .max(100),
      },
      annotations: WRITE,
    },
    ({ folderId, cards }) => run(() => library.createCards(db, userId, folderId, cards)),
  );

  server.registerTool(
    "update_card",
    {
      description: "Change a card's question or solution, or move it to another folder. Earlier attempts are kept.",
      inputSchema: {
        cardId: z.string(),
        question: z.string().min(1).max(20_000).optional(),
        solution: z.string().min(1).max(20_000).optional(),
        folderId: z.string().optional(),
      },
      annotations: WRITE,
    },
    ({ cardId, ...patch }) => run(() => library.updateCard(db, userId, cardId, patch)),
  );

  server.registerTool(
    "delete_card",
    {
      description: "Permanently delete a card and its learning history. Cannot be undone.",
      inputSchema: { cardId: z.string() },
      annotations: DESTRUCTIVE,
    },
    ({ cardId }) => run(() => library.deleteCard(db, userId, cardId)),
  );

  return server;
}

/**
 * Answers one MCP request over Streamable HTTP. Stateless: every request brings its access
 * token and gets a fresh server bound to that token's account, so it works on serverless hosts.
 */
export async function handleMcpRequest(db: Database, request: Request): Promise<Response> {
  const userId = await userForToken(db, request.headers.get("authorization"));
  if (!userId) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "Missing or invalid access token." }, id: null },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await createMcpServer(db, userId).connect(transport);
  return transport.handleRequest(request);
}
