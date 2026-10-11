// Server-side only: reads the OpenRouter key. Do not import from client components.
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export const GRADING_MODEL = process.env.GRADING_MODEL || "openai/gpt-6-luna";
// Free accounts: free models first, then the cheapest paid one that still grades reliably.
// OpenRouter caps free models per day for the whole key; once they are used up the last one takes over.
export const FREE_PLAN_GRADING_MODELS = process.env.FREE_PLAN_GRADING_MODELS?.split(",")
  .map((model) => model.trim())
  .filter(Boolean) ?? [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "dots-studio/dots-3-note-preview:free",
  "inclusionai/ling-3.0-flash-vl",
];
export const TRANSCRIBE_MODEL = process.env.TRANSCRIBE_MODEL || "google/gemini-3.8-flash";
// The study tandem: the model that talks, and the one that gives it a voice.
export const TANDEM_MODEL = process.env.TANDEM_MODEL || GRADING_MODEL;
export const SPEECH_MODEL = process.env.SPEECH_MODEL || "elevenlabs/eleven-v4-turbo";

export class MissingKeyError extends Error {
  constructor() {
    super("OPENROUTER_API_KEY ist nicht gesetzt. Trage den Key in .env.local ein und starte den Server neu.");
  }
}

export function openrouterKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new MissingKeyError();
  return apiKey;
}

export function openrouter() {
  return createOpenRouter({ apiKey: openrouterKey() });
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
