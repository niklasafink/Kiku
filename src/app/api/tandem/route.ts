import { z } from "zod";
import { errorResponse, FREE_PLAN_GRADING_MODELS } from "@/lib/ai";
import {
  MAX_HISTORY,
  MAX_KNOWLEDGE_CARD_CHARS,
  MAX_KNOWLEDGE_CHARS,
  MAX_MESSAGE_CHARS,
  TANDEM_MODES,
  TANDEM_VOICES,
} from "@/lib/tandem";
import { refundAi, takeAi } from "@/server/aiQuota";
import { planOrDeny } from "@/server/auth";
import { speakReply, tandemReply } from "@/server/tandem";

// As long as a card may be, see MAX_CARD_TEXT.
const card = z.object({ question: z.string().max(20_000), solution: z.string().max(20_000) });
const knowledgeCard = z.object({
  question: z.string().max(MAX_KNOWLEDGE_CARD_CHARS),
  solution: z.string().max(MAX_KNOWLEDGE_CARD_CHARS),
});

const requestSchema = z.object({
  mode: z.enum(TANDEM_MODES),
  folder: z.string().max(200),
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
 * One turn of the conversation. Answers with two lines of JSON: first the reply as text, so it
 * can be shown at once, then the same reply as speech (base64 MP3, or null if the browser is to read it).
 */
export async function POST(request: Request) {
  const plan = await planOrDeny();
  if (plan instanceof Response) return plan;

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  // The realistic voice is part of the paid plan; free accounts hear the voice of their device.
  const voice = plan !== "free" ? parsed.data.voice : null;

  // A turn counts like a grading: one answer of the model, plus its voice.
  const allowance = await takeAi(plan);
  if (allowance instanceof Response) return allowance;

  let reply: Awaited<ReturnType<typeof tandemReply>>;
  try {
    const options = plan === "free" ? { models: FREE_PLAN_GRADING_MODELS, thinking: false } : undefined;
    reply = await tandemReply({ ...parsed.data, voiced: voice !== null }, options);
  } catch (error) {
    await refundAi(allowance);
    return errorResponse(error);
  }

  const encoder = new TextEncoder();
  const line = (value: unknown) => encoder.encode(`${JSON.stringify(value)}\n`);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(
        line({ text: reply.text, advance: reply.advance, voiced: voice !== null, remaining: allowance.remaining, limit: allowance.limit }),
      );
      if (voice) {
        let audio: string | null = null;
        try {
          audio = Buffer.from(await speakReply(reply.spoken, voice)).toString("base64");
        } catch (error) {
          // The reply itself is there; the browser reads it with its own voice instead.
          console.error(error);
        }
        controller.enqueue(line({ audio }));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
