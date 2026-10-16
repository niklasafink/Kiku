import { z } from "zod";
import { errorResponse, TANDEM_FAST_MODEL, TANDEM_MODEL } from "@/lib/ai";
import {
  MAX_HISTORY,
  MAX_KNOWLEDGE_CARD_CHARS,
  MAX_KNOWLEDGE_CHARS,
  MAX_MESSAGE_CHARS,
  MAX_SPOKEN_CHARS,
  parseReply,
  partialText,
  speakableEnd,
  TANDEM_MODES,
  TANDEM_VOICES,
} from "@/lib/tandem";
import { refundAi, takeAi } from "@/server/aiQuota";
import { currentUser, SERVER_MODE } from "@/server/auth";
import { getDb } from "@/server/db";
import { planOf } from "@/server/plan";
import { steuerrechtAvailable } from "@/server/steuerrecht";
import { speakReply, tandemReply, type TandemAccess } from "@/server/tandem";

// As long as a card may be, see MAX_CARD_TEXT.
const card = z.object({ question: z.string().max(20_000), solution: z.string().max(20_000) });
const knowledgeCard = z.object({
  question: z.string().max(MAX_KNOWLEDGE_CARD_CHARS),
  solution: z.string().max(MAX_KNOWLEDGE_CARD_CHARS),
});

const requestSchema = z.object({
  mode: z.enum(TANDEM_MODES),
  folder: z.string().max(200),
  /** The folder the tandem started from; its cards come first when the partner searches the library. */
  folderId: z.string().max(100).optional(),
  knowledge: z
    .array(knowledgeCard)
    .max(5000)
    .refine((cards) => cards.reduce((sum, c) => sum + c.question.length + c.solution.length, 0) <= MAX_KNOWLEDGE_CHARS),
  card: card.nullable(),
  next: card.nullable(),
  position: z.number().int().min(0).max(100_000),
  total: z.number().int().min(0).max(100_000),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(MAX_MESSAGE_CHARS) }))
    .max(MAX_HISTORY)
    .refine((messages) => messages.length === 0 || messages[messages.length - 1].role === "user"),
  /** Null: the browser reads the reply with its own voice. */
  voice: z.enum(TANDEM_VOICES.map((voice) => voice.id)).nullable(),
});

/**
 * One turn of the conversation, streamed as one JSON value per line while it is written:
 * { type: "lookup" } while the partner looks something up, { type: "text" } with the reply so far,
 * { type: "audio" } for each voiced piece in order (base64 MP3, or null with the piece's text for
 * the browser's own voice), then { type: "done" } with the whole reply, or { type: "error" }.
 */
export async function POST(request: Request) {
  const user = SERVER_MODE ? await currentUser() : null;
  if (SERVER_MODE && !user) return Response.json({ error: "Bitte melde dich an." }, { status: 401 });
  // Locally the operator's own key pays, so everything is on.
  const plan = user ? planOf(user) : "paid";

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  // The realistic voice is part of the paid plan; free accounts hear the voice of their device.
  const voice = plan !== "free" ? parsed.data.voice : null;

  // A turn counts like a grading: one answer of the model, plus its voice.
  const allowance = await takeAi(plan);
  if (allowance instanceof Response) return allowance;

  const access: TandemAccess = {
    library: user && parsed.data.folderId ? { db: getDb(), userId: user.id, folderId: parsed.data.folderId } : undefined,
    // The tax law knowledge base is the operator's own material, licensed for private use only.
    taxLaw: plan === "admin" && steuerrechtAvailable(),
  };
  // Free accounts talk with the small model, which costs a tenth and is a little quicker still.
  const models = plan === "free" ? [TANDEM_FAST_MODEL] : [TANDEM_MODEL, TANDEM_FAST_MODEL];
  const replies = tandemReply({ ...parsed.data, voiced: voice !== null }, access, models);

  // Fail before the stream starts if the model cannot be reached at all, so the browser gets a status.
  let first: Awaited<ReturnType<typeof replies.next>>;
  try {
    first = await replies.next();
  } catch (error) {
    await refundAi(allowance);
    return errorResponse(error);
  }

  const encoder = new TextEncoder();
  const line = (value: unknown) => encoder.encode(`${JSON.stringify(value)}\n`);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (value: unknown) => controller.enqueue(line(value));
      let raw = "";
      let voicedTo = 0;
      let audio = Promise.resolve();
      // Each piece is voiced as soon as it is written; the pieces are sent in order.
      const voicePiece = (piece: string) => {
        const { spoken, text } = parseReply(piece);
        if (!text || !voice) return;
        const speech = speakReply(spoken, voice)
          .then((bytes) => Buffer.from(bytes).toString("base64"))
          .catch((error) => {
            // The browser reads this piece with its own voice instead.
            console.error(error);
            return null;
          });
        audio = audio.then(async () => send({ type: "audio", audio: await speech, text }));
      };
      const voiceReady = (final: boolean) => {
        while (voicedTo < Math.min(raw.length, MAX_SPOKEN_CHARS)) {
          const end = final ? raw.length : speakableEnd(raw, voicedTo, voicedTo === 0);
          if (end < 0) return;
          voicePiece(raw.slice(voicedTo, Math.min(end, MAX_SPOKEN_CHARS)));
          voicedTo = end;
        }
      };

      try {
        for (let step = first; !step.done; step = await replies.next()) {
          const event = step.value;
          if (event.type === "lookup") {
            send({ type: "lookup", tool: event.tool });
            continue;
          }
          raw += event.text;
          send({ type: "text", text: partialText(raw) });
          voiceReady(false);
        }
        voiceReady(true);
        const reply = parseReply(raw);
        await audio;
        send({
          type: "done",
          text: reply.text,
          advance: reply.advance,
          voiced: voice !== null,
          remaining: allowance.remaining,
          limit: allowance.limit,
        });
      } catch (error) {
        console.error(error);
        if (!raw) await refundAi(allowance);
        await audio;
        send({ type: "error", error: "Die KI-Anfrage ist fehlgeschlagen. Bitte versuche es noch einmal.", text: raw ? parseReply(raw).text : null });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
