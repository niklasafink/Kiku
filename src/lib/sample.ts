// A small folder for the first visit, so the spoken answer and the grading can be tried
// right away instead of typing cards first. German general knowledge, one card per subject.
import { createCards, createFolder } from "./repo";
import type { Folder } from "./types";

export const SAMPLE_FOLDER_NAME = "Beispiel: So geht Kiku";

const SAMPLE_CARDS: { question: string; solution: string }[] = [
  {
    question: "Was passiert bei der Photosynthese?",
    solution:
      "Pflanzen wandeln Lichtenergie in chemische Energie um. Aus Wasser und Kohlendioxid entstehen Glukose und Sauerstoff.",
  },
  {
    question: "Nenne die drei Gewalten im Staat.",
    solution: "- Legislative (Gesetzgebung)\n- Exekutive (ausführende Gewalt)\n- Judikative (Rechtsprechung)",
  },
  {
    question: "Wie lautet der Satz des Pythagoras?",
    solution: "In einem rechtwinkligen Dreieck gilt $a^2 + b^2 = c^2$. Dabei ist $c$ die Hypotenuse, die Seite gegenüber dem rechten Winkel.",
  },
  {
    question: "Was besagt das Gesetz von Angebot und Nachfrage?",
    solution:
      "Steigt der Preis, sinkt die nachgefragte Menge und das Angebot nimmt zu. Der Gleichgewichtspreis liegt dort, wo sich Angebot und Nachfrage treffen.",
  },
  {
    question: "Wofür steht DNA, und welche Aufgabe hat sie?",
    solution: "Desoxyribonukleinsäure. Sie trägt die Erbinformation und liegt in jeder Zelle als Doppelhelix vor.",
  },
  {
    question: "Wann fiel die Berliner Mauer, und was folgte daraus?",
    solution: "Am 9. November 1989. Knapp ein Jahr später, am 3. Oktober 1990, wurde Deutschland wiedervereinigt.",
  },
];

/** Creates the sample folder with its cards at the top level and returns the folder. */
export async function createSampleFolder(): Promise<Folder> {
  const folder = await createFolder(SAMPLE_FOLDER_NAME, "🎓", null);
  await createCards(folder.id, SAMPLE_CARDS);
  return folder;
}
