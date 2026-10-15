import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalPage } from "../_components/LegalPage";
import { SERVER_MODE } from "@/server/auth";

export const metadata: Metadata = {
  title: "AGB | Kiku",
  description: "Nutzungsbedingungen für die von Dealzforest betriebene Kiku-App, inklusive Widerrufsbelehrung.",
};

// Entwurf: vor Veröffentlichung juristisch prüfen lassen.
export default function TermsPage() {
  if (!SERVER_MODE) notFound();

  return (
    <LegalPage title="Allgemeine Geschäftsbedingungen" updated="8. Oktober 2026">
      <section>
        <h2>1. Geltungsbereich</h2>
        <p>
          Diese Bedingungen gelten für die Nutzung der von der Dealzforest UG (haftungsbeschränkt), Frankfurt am Main
          (im Folgenden „wir“), betriebenen Lern-App Kiku. Sie gelten nicht für selbst gehostete Installationen des
          unter MIT-Lizenz veröffentlichten Quellcodes.
        </p>
      </section>

      <section>
        <h2>2. Leistung</h2>
        <p>
          Kiku ermöglicht das Anlegen von Karteikarten, das Lernen damit und, je nach Tarif, die Transkription
          gesprochener Antworten und deren Abgleich mit der eigenen Lösung durch ein KI-Modell. Die Bewertung durch die
          KI ist eine Hilfe beim Lernen und kann Fehler enthalten. Sie ersetzt keine fachliche Prüfung.
        </p>
      </section>

      <section>
        <h2>3. Konto</h2>
        <p>
          Für die gehostete App ist ein Konto nötig. Du bist für die Geheimhaltung deines Passworts und für
          Zugriffs-Tokens verantwortlich, die du für KI-Assistenten (MCP) erstellst. Ein Konto darf nur von einer
          Person genutzt werden.
        </p>
      </section>

      <section>
        <h2>4. Tarife, Preise und Laufzeit</h2>
        <ul>
          <li>Pro, monatlich: 4,99 € pro Monat, enthält 300 KI-Verarbeitungen pro Monat. Verlängert sich jeweils um einen Monat und ist zum Ende des Monats kündbar.</li>
          <li>Pro, jährlich: 29 € pro Jahr, enthält 500 KI-Verarbeitungen pro Monat. Verlängert sich jeweils um ein Jahr und ist zum Ende des Jahres kündbar.</li>
          <li>Einmalkauf: 49 € einmalig, enthält 4.000 KI-Verarbeitungen pro Jahr für zwei Jahre. Danach bleibt die App ohne Zeitlimit nutzbar; weitere KI-Kontingente können zum Selbstkostenpreis gekauft werden.</li>
        </ul>
        <p>
          Alle Preise enthalten die gesetzliche Umsatzsteuer. Nicht verbrauchte KI-Verarbeitungen verfallen am Ende
          des Abrechnungszeitraums. Zusätzliche Kontingente können in allen bezahlten Tarifen gekauft werden.
        </p>
      </section>

      <section>
        <h2>5. Kündigung</h2>
        <p>
          Abos kannst du jederzeit zum Ende der laufenden Periode in den Einstellungen kündigen. Nach der Kündigung
          bleiben Karten, Ordner und Verlauf im Konto erhalten und lassen sich exportieren; nur die KI-Funktionen
          stehen nicht mehr zur Verfügung. Wir können den Vertrag mit einer Frist von drei Monaten kündigen oder bei
          Missbrauch fristlos.
        </p>
      </section>

      <section>
        <h2>6. Inhalte</h2>
        <p>
          Die Inhalte deiner Karten gehören dir. Du räumst uns nur das Recht ein, sie zum Betrieb der App zu
          speichern und an die in der Datenschutzerklärung genannten KI-Dienstleister zu senden. Du darfst keine
          Inhalte anlegen, die Rechte Dritter verletzen oder gegen Gesetze verstoßen.
        </p>
      </section>

      <section>
        <h2>7. Verfügbarkeit und Haftung</h2>
        <p>
          Wir bemühen uns um eine hohe Verfügbarkeit, garantieren sie aber nicht. Für Wartung kann die App
          vorübergehend nicht erreichbar sein. Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie
          bei Verletzung von Leben, Körper oder Gesundheit. Bei einfacher Fahrlässigkeit haften wir nur bei
          Verletzung wesentlicher Vertragspflichten und begrenzt auf den vorhersehbaren, vertragstypischen Schaden.
          Sichere deine Lerninhalte regelmäßig über den Export.
        </p>
      </section>

      <section>
        <h2>8. Widerrufsbelehrung</h2>
        <p>
          Verbraucher haben das Recht, diesen Vertrag binnen vierzehn Tagen ohne Angabe von Gründen zu widerrufen.
          Die Frist beginnt mit Vertragsschluss. Für den Widerruf genügt eine eindeutige Erklärung, zum Beispiel per
          E-Mail an <a href="mailto:info@dealzforest.com">info@dealzforest.com</a>. Wir erstatten alle Zahlungen
          innerhalb von vierzehn Tagen nach Eingang des Widerrufs mit demselben Zahlungsmittel.
        </p>
        <p>
          Wenn du verlangst, dass die KI-Funktionen schon während der Widerrufsfrist bereitgestellt werden, zahlst du
          im Fall eines Widerrufs einen angemessenen Betrag für die bis dahin genutzten Leistungen.
        </p>
      </section>

      <section>
        <h2>9. Änderungen dieser Bedingungen</h2>
        <p>
          Änderungen kündigen wir mindestens vier Wochen vorher per E-Mail an. Widersprichst du nicht bis zum
          Inkrafttreten, gelten die neuen Bedingungen. Auf diese Folge weisen wir in der Ankündigung hin.
        </p>
      </section>

      <section>
        <h2>10. Schlussbestimmungen</h2>
        <p>
          Es gilt deutsches Recht. Gegenüber Verbrauchern gilt dies nur, soweit ihnen dadurch nicht der Schutz
          zwingender Vorschriften ihres Aufenthaltsstaats entzogen wird. Die EU-Kommission stellt eine Plattform zur
          Online-Streitbeilegung bereit; zur Teilnahme an Streitbeilegungsverfahren vor einer
          Verbraucherschlichtungsstelle sind wir nicht verpflichtet und nicht bereit.
        </p>
      </section>
    </LegalPage>
  );
}
