// The cards of the demo on the homepage: pick a field, then a subject, then answer one card.
export interface DemoCard {
  id: string;
  subject: string;
  question: string;
  solution: string;
}

export interface DemoField {
  name: string;
  emoji: string;
  cards: DemoCard[];
}

export const DEMO_FIELDS: DemoField[] = [
  {
    name: "Jura",
    emoji: "⚖️",
    cards: [
      {
        id: "jura-zivilrecht",
        subject: "Zivilrecht",
        question: "Welche Voraussetzungen hat ein Anspruch aus § 823 Abs. 1 BGB?",
        solution:
          "Ein geschütztes Rechtsgut oder absolutes Recht wurde verletzt. Die Verletzung beruht auf einem Verhalten des Schädigers. Das Verhalten war rechtswidrig. Der Schädiger handelte schuldhaft, also vorsätzlich oder fahrlässig. Daraus ist ein Schaden entstanden.",
      },
      {
        id: "jura-strafrecht",
        subject: "Strafrecht",
        question: "Was setzt der Tatbestand des Diebstahls nach § 242 StGB voraus?",
        solution:
          "Tatobjekt ist eine fremde bewegliche Sache. Tathandlung ist die Wegnahme, also der Bruch fremden und die Begründung neuen Gewahrsams. Der Täter handelt vorsätzlich. Außerdem hat er die Absicht, die Sache sich oder einem Dritten rechtswidrig zuzueignen.",
      },
      {
        id: "jura-oeffentliches-recht",
        subject: "Öffentliches Recht",
        question: "Welche Merkmale hat ein Verwaltungsakt nach § 35 Satz 1 VwVfG?",
        solution:
          "Ein Verwaltungsakt ist eine hoheitliche Maßnahme einer Behörde. Sie ergeht auf dem Gebiet des öffentlichen Rechts. Sie regelt einen Einzelfall. Und sie ist auf unmittelbare Rechtswirkung nach außen gerichtet.",
      },
    ],
  },
  {
    name: "Medizin",
    emoji: "🩺",
    cards: [
      {
        id: "medizin-anatomie",
        subject: "Anatomie",
        question: "Welche Muskeln bilden die Rotatorenmanschette und was ist ihre Aufgabe?",
        solution:
          "Die Rotatorenmanschette besteht aus vier Muskeln. Das sind der Musculus supraspinatus, der Musculus infraspinatus, der Musculus teres minor und der Musculus subscapularis. Sie zentrieren den Humeruskopf in der Gelenkpfanne.",
      },
      {
        id: "medizin-physiologie",
        subject: "Physiologie",
        question: "Wie läuft ein Aktionspotential an der Nervenzelle ab?",
        solution:
          "Wird das Schwellenpotential erreicht, öffnen sich spannungsgesteuerte Natriumkanäle. Natrium strömt ein und die Membran depolarisiert. Dann inaktivieren die Natriumkanäle und Kaliumkanäle öffnen sich. Kalium strömt aus und die Membran repolarisiert. Nach einer kurzen Hyperpolarisation ist das Ruhepotential wieder erreicht.",
      },
      {
        id: "medizin-pharmakologie",
        subject: "Pharmakologie",
        question: "Wie wirken ACE-Hemmer?",
        solution:
          "ACE-Hemmer blockieren das Angiotensin-Converting-Enzym. Dadurch entsteht weniger Angiotensin II. Die Gefäße erweitern sich und der Blutdruck sinkt. Außerdem wird weniger Aldosteron ausgeschüttet. Weil Bradykinin langsamer abgebaut wird, ist Reizhusten eine typische Nebenwirkung.",
      },
    ],
  },
  {
    name: "Wirtschaft",
    emoji: "📊",
    cards: [
      {
        id: "wirtschaft-rechnungswesen",
        subject: "Rechnungswesen",
        question: "Was unterscheidet Aktivtausch, Passivtausch, Bilanzverlängerung und Bilanzverkürzung?",
        solution:
          "Beim Aktivtausch ändern sich nur Aktivposten, die Bilanzsumme bleibt gleich. Beim Passivtausch ändern sich nur Passivposten, die Bilanzsumme bleibt ebenfalls gleich. Bei der Bilanzverlängerung nehmen Aktiv- und Passivseite um denselben Betrag zu. Bei der Bilanzverkürzung nehmen beide Seiten um denselben Betrag ab.",
      },
      {
        id: "wirtschaft-steuerrecht",
        subject: "Steuerrecht",
        question: "Was ist eine verdeckte Gewinnausschüttung?",
        solution:
          "Eine verdeckte Gewinnausschüttung ist eine Vermögensminderung oder verhinderte Vermögensmehrung bei einer Körperschaft. Sie ist durch das Gesellschaftsverhältnis veranlasst. Sie wirkt sich auf den Unterschiedsbetrag nach § 4 Abs. 1 Satz 1 EStG aus. Und sie beruht nicht auf einem ordnungsgemäßen Gewinnverteilungsbeschluss.",
      },
      {
        id: "wirtschaft-marketing",
        subject: "Marketing",
        question: "Welche Instrumente umfasst der Marketing-Mix?",
        solution:
          "Der Marketing-Mix umfasst vier Instrumente. Die Produktpolitik bestimmt das Angebot. Die Preispolitik legt Preise und Konditionen fest. Die Distributionspolitik regelt den Weg zum Kunden. Die Kommunikationspolitik macht das Angebot bekannt.",
      },
    ],
  },
  {
    // Soft hyphens so the name breaks cleanly on the small demo cards.
    name: "Natur­wissen­schaften",
    emoji: "🔬",
    cards: [
      {
        id: "natur-biologie",
        subject: "Biologie",
        question: "Welche Phasen hat die Mitose und was passiert in ihnen?",
        solution:
          "In der Prophase kondensieren die Chromosomen und der Spindelapparat bildet sich. In der Metaphase ordnen sich die Chromosomen in der Äquatorialebene an. In der Anaphase werden die Schwesterchromatiden zu den Polen gezogen. In der Telophase bilden sich neue Kernhüllen und die Chromosomen entspiralisieren sich.",
      },
      {
        id: "natur-chemie",
        subject: "Chemie",
        question: "Was besagt das Prinzip von Le Chatelier?",
        solution:
          "Wird auf ein System im chemischen Gleichgewicht ein Zwang ausgeübt, weicht es diesem Zwang aus. Das Gleichgewicht verschiebt sich so, dass die Wirkung des Zwangs kleiner wird. Solche Zwänge sind Änderungen von Konzentration, Druck oder Temperatur.",
      },
      {
        id: "natur-physik",
        subject: "Physik",
        question: "Wie lauten die drei Newtonschen Axiome?",
        solution:
          "Ein Körper bleibt in Ruhe oder gleichförmiger geradliniger Bewegung, solange keine Kraft auf ihn wirkt. Die Kraft ist gleich Masse mal Beschleunigung. Jede Kraft ruft eine gleich große, entgegengesetzte Gegenkraft hervor.",
      },
    ],
  },
];

export function findDemoCard(id: string): DemoCard | undefined {
  return DEMO_FIELDS.flatMap((field) => field.cards).find((card) => card.id === id);
}
