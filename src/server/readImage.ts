import { generateText } from "ai";
import { openrouter, TRANSCRIBE_MODEL } from "@/lib/ai";

/** What the picture shows: an answer written by hand, or a page of study material. */
export type ImageKind = "handwriting" | "document";

const PROMPTS: Record<ImageKind, string> = {
  handwriting:
    "Das Bild zeigt eine handgeschriebene Antwort eines Studenten. Schreibe den Text wörtlich ab, so wie er dasteht: Korrigiere weder Inhalt noch Formulierung, ergänze nichts. Offensichtlich durchgestrichene Wörter lässt du weg. Zeilenumbrüche innerhalb eines Satzes werden zu Leerzeichen, Absätze und Aufzählungen bleiben als Zeilen erhalten. Formeln schreibst du als lesbaren Text. Die Sprache ist in der Regel Deutsch. Gib ausschließlich den Text aus, ohne Einleitung, Anführungszeichen oder Kommentar. Wenn nichts Lesbares zu sehen ist, antworte mit einer leeren Nachricht.",
  document:
    "Das Bild zeigt eine Seite aus Lernunterlagen (Folie, Skript, Buchseite oder Mitschrift). Schreibe den gesamten lesbaren Text in Lesereihenfolge ab. Überschriften, Absätze und Aufzählungen bleiben als Zeilen erhalten, Tabellen Zeile für Zeile. Beschreibe Abbildungen in einem kurzen Satz in eckigen Klammern, wenn sie für das Verständnis wichtig sind. Gib ausschließlich den Text aus, ohne Einleitung oder Kommentar. Wenn nichts Lesbares zu sehen ist, antworte mit einer leeren Nachricht.",
};

/** Reads the text in a picture. Throws if the AI request fails. */
export async function readImageText(image: Uint8Array, mediaType: string, kind: ImageKind): Promise<string> {
  const { text } = await generateText({
    model: openrouter()(TRANSCRIBE_MODEL),
    // Copying what is written needs no thinking.
    providerOptions: { openrouter: { reasoning: { effort: "minimal" } } },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPTS[kind] },
          { type: "file", mediaType, data: image },
        ],
      },
    ],
  });
  return text.trim();
}
