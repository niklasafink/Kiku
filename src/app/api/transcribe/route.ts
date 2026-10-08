import { generateText } from "ai";
import { errorResponse, openrouter, TRANSCRIBE_MODEL } from "@/lib/ai";
import { denyIfSignedOut } from "@/server/auth";

// 16 kHz mono 16-bit WAV is ~32 KB/s. The client cuts long recordings into pieces of at most
// a minute (~2 MB), so every request stays below typical 4.5 MB body limits.
const MAX_BYTES = 4_200_000;

export async function POST(request: Request) {
  const denied = await denyIfSignedOut();
  if (denied) return denied;

  const audio = new Uint8Array(await request.arrayBuffer());
  if (audio.byteLength === 0) {
    return Response.json({ error: "Keine Aufnahme erhalten." }, { status: 400 });
  }
  if (audio.byteLength > MAX_BYTES) {
    return Response.json({ error: "Die Aufnahme ist zu lang." }, { status: 413 });
  }

  try {
    const { text } = await generateText({
      model: openrouter()(TRANSCRIBE_MODEL),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Transkribiere diese Aufnahme wörtlich. Die Sprache ist in der Regel Deutsch, Fachbegriffe können aus anderen Sprachen stammen. Gib ausschließlich das Transkript aus, ohne Einleitung, Anführungszeichen oder Kommentar. Wenn nichts Verständliches gesagt wird, antworte mit einer leeren Nachricht.",
            },
            { type: "file", mediaType: "audio/wav", data: audio },
          ],
        },
      ],
    });
    return Response.json({ text: text.trim() });
  } catch (error) {
    return errorResponse(error);
  }
}
