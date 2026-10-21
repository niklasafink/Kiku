// Questions and answers shown on the homepage and the pricing page; the pages also hand them to
// search engines as FAQPage data, so the two always say the same.

export const HOME_QUESTIONS = [
  {
    question: "Was ist Active Recall?",
    answer: "Du holst die Antwort aus dem Kopf, statt sie zu lesen. So wirst du auch in der Klausur gefragt.",
  },
  {
    question: "Wie bewertet die KI?",
    answer:
      "Sie vergleicht deine Antwort mit deiner eigenen Lösung, Satz für Satz. Grün ist genannt, grau fehlt, rot ist unsicher oder widersprüchlich.",
  },
  {
    question: "Für welche Fächer?",
    answer: "Für alles, was du in Sätzen wiedergeben musst: Jura, Medizin, BWL, Naturwissenschaften.",
  },
  {
    question: "Kann ich meine Karten importieren?",
    answer: "Ja, aus Anki und aus Tabellen. Exportieren kannst du sie genauso.",
  },
  {
    question: "Ist Kiku kostenlos?",
    answer:
      "Ja. Mit einem kostenlosen Konto lernst du sofort, mit KI-Auswertung und Sync. Pro prüft genauer und versteht dich beim Sprechen besser. Der Code ist offen, du kannst Kiku auch selbst hosten.",
  },
];

export const PRICING_QUESTIONS = [
  {
    question: "Was ist im kostenlosen Tarif drin?",
    answer:
      "Die ganze App mit Konto und Sync: Karten, Ordner, Lernen, Import, Suche und Backup. Die KI prüft deine Antworten mit einem einfacheren Modell, die Spracheingabe läuft im Browser. Du kannst Kiku auch selbst hosten, der Quellcode steht unter MIT-Lizenz auf GitHub.",
  },
  {
    question: "Was zählt als KI-Verarbeitung?",
    answer:
      "Jede Antwort, die die KI mit deiner Lösung abgleicht, egal ob gesprochen oder getippt. Wenn du eine Lösung nur aufdeckst, zählt das nicht.",
  },
  {
    question: "Was passiert, wenn mein Kontingent aufgebraucht ist?",
    answer:
      "Du kannst weiter Karten anlegen, lernen und Lösungen aufdecken. Für weitere Auswertungen kaufst du ein Kontingent zum Selbstkostenpreis dazu oder wartest, bis dein Kontingent sich erneuert.",
  },
  {
    question: "Worin unterscheiden sich monatlich und jährlich?",
    answer:
      "Im Preis und im Kontingent: Monatlich zahlst du 4,99 € und bekommst 300 KI-Verarbeitungen pro Monat. Jährlich sind es 29 €, also 2,42 € im Monat, mit 500 KI-Verarbeitungen pro Monat. Beides ist zum Ende der Laufzeit kündbar.",
  },
  {
    question: "Wie lange reicht der Einmalkauf?",
    answer:
      "Die App gehört dir dauerhaft, ohne Verlängerung. Das KI-Kontingent von 4.000 Verarbeitungen pro Jahr ist für zwei Jahre enthalten, danach kaufst du Kontingente zum Selbstkostenpreis dazu.",
  },
  {
    question: "Was bleibt, wenn ich kündige?",
    answer: "Deine Karten, Ordner und dein Verlauf bleiben erhalten und lassen sich jederzeit als Backup exportieren.",
  },
];
