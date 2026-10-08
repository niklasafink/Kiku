// Server-side only: reads the OpenRouter key. Do not import from client components.
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export const GRADING_MODEL = process.env.GRADING_MODEL || "anthropic/claude-sonnet-5.5";
export const TRANSCRIBE_MODEL = process.env.TRANSCRIBE_MODEL || "google/gemini-3.8-flash";

export class MissingKeyError extends Error {
  constructor() {
    super("OPENROUTER_API_KEY ist nicht gesetzt. Trage den Key in .env.local ein und starte den Server neu.");
  }
}

export function openrouter() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new MissingKeyError();
  return createOpenRouter({ apiKey });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof MissingKeyError) {
    return Response.json({ error: error.message }, { status: 503 });
  }
  console.error(error);
  return Response.json(
    { error: "Die KI-Anfrage ist fehlgeschlagen. Bitte versuche es noch einmal." },
    { status: 502 },
  );
}
