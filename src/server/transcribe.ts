import { generateText } from "ai";
import { openrouter, TRANSCRIBE_MODEL } from "@/lib/ai";

/** Transcribes a WAV recording. Throws if the AI request fails. */
export async function transcribeAudio(audio: Uint8Array): Promise<string> {
  const { text } = await generateText({
    model: openrouter()(TRANSCRIBE_MODEL),
    // Writing down what was said needs no thinking; left on, it is most of the cost of a transcript.
    providerOptions: { openrouter: { reasoning: { effort: "minimal" } } },
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
  return text.trim();
}
