// What the card generator makes of the material; shared by the form and the server.

export const GENERATE_MODES = ["auto", "theory", "schema", "exercises"] as const;
export type GenerateMode = (typeof GENERATE_MODES)[number];

export const GENERATE_MODE_LABELS: Record<GenerateMode, { label: string; hint: string }> = {
  auto: { label: "Automatisch erkennen", hint: "Theorie wird zusammengefasst, Aufgaben werden zu Prüfungsschemata mit Beispiel." },
  theory: { label: "Theorie zusammenfassen", hint: "Definitionen, Voraussetzungen, Abläufe und Abgrenzungen als Karten." },
  schema: { label: "Prüfungsschemata aus Aufgaben", hint: "Allgemeines Schema, Schritt für Schritt an der Aufgabe als Beispiel nachvollzogen." },
  exercises: { label: "Übungsfälle aus dem Skript", hint: "Die KI denkt sich kleine Fälle mit Lösungsweg aus, wenn du keine Aufgaben hast." },
};
