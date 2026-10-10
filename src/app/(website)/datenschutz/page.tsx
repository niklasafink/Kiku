import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AnalyticsOptOut, ConsentSettingsButton } from "../_components/Analytics";
import { LegalPage } from "../_components/LegalPage";
import { SERVER_MODE } from "@/server/auth";

export const metadata: Metadata = {
  title: "Datenschutz · Kiku",
  description: "Welche Daten Kiku verarbeitet, wofür, und welche Dienstleister beteiligt sind.",
};

// Written from what the code actually does (hosting, database, AI provider, sign-up notice, analytics).
// Entwurf: vor Veröffentlichung juristisch prüfen lassen.
export default function PrivacyPage() {
  if (!SERVER_MODE) notFound();

  return (
    <LegalPage title="Datenschutzerklärung" updated="10. Oktober 2026">
      <section>
        <h2>1. Verantwortlicher</h2>
        <p>
          Dealzforest UG (haftungsbeschränkt), Europa-Allee 49, 60327 Frankfurt am Main, Deutschland, vertreten durch
          den Geschäftsführer Jörn Ulrich Fink. E-Mail: <a href="mailto:info@dealzforest.com">info@dealzforest.com</a>.
        </p>
      </section>

      <section>
        <h2>2. Was Kiku ist und welche Daten dabei anfallen</h2>
        <p>
          Kiku ist eine Lern-App für Karteikarten. Du legst Fragen und deine eigenen Lösungen an, beantwortest sie
          gesprochen oder getippt, und eine KI gleicht deine Antwort mit deiner Lösung ab. Dabei verarbeiten wir:
        </p>
        <ul>
          <li>Kontodaten: E-Mail-Adresse, optional ein Name, Passwort (nur als Hash gespeichert), Zeitpunkt der Registrierung.</li>
          <li>Lerninhalte: Ordner, Karten mit Frage und Lösung, deine Antworten, die Bewertungen und der Verlauf pro Karte.</li>
          <li>Sprachaufnahmen: nur für die Umwandlung in Text. Die Aufnahme wird nicht gespeichert, nur der Text.</li>
          <li>Technische Daten: IP-Adresse, Zeitpunkt des Zugriffs, Browser- und Gerätetyp, in den Server-Logs des Hosters.</li>
          <li>Zugriffs-Tokens, wenn du einen KI-Assistenten per MCP mit deinem Konto verbindest.</li>
          <li>Nutzungsdaten für die Statistik: welche Seiten aufgerufen werden und woher ein Besuch kommt (siehe Abschnitt 6).</li>
        </ul>
      </section>

      <section>
        <h2>3. Zwecke und Rechtsgrundlagen</h2>
        <ul>
          <li>Bereitstellung des Kontos, Synchronisation zwischen deinen Geräten und Abwicklung von Käufen: Vertragserfüllung, Art. 6 Abs. 1 lit. b DSGVO.</li>
          <li>Transkription und KI-Bewertung deiner Antworten: Vertragserfüllung, Art. 6 Abs. 1 lit. b DSGVO.</li>
          <li>Sicherheit und Fehleranalyse anhand von Server-Logs: berechtigtes Interesse, Art. 6 Abs. 1 lit. f DSGVO.</li>
          <li>Hinweis an uns über eine neue Registrierung (siehe Abschnitt 5): berechtigtes Interesse am Betrieb des Dienstes, Art. 6 Abs. 1 lit. f DSGVO.</li>
          <li>Statistik ohne Cookies: berechtigtes Interesse an der Reichweitenmessung, Art. 6 Abs. 1 lit. f DSGVO.</li>
          <li>Statistik mit Cookies: deine Einwilligung, Art. 6 Abs. 1 lit. a DSGVO und § 25 Abs. 1 TDDDG.</li>
        </ul>
      </section>

      <section>
        <h2>4. Hosting und Datenbank</h2>
        <p>
          Die App läuft auf Servern von Vercel Inc. in der Region Frankfurt am Main. Die Datenbank wird von Neon Inc.
          betrieben, ebenfalls in Frankfurt am Main. Mit beiden Anbietern bestehen Verträge zur Auftragsverarbeitung.
          Soweit die Anbieter ihren Sitz in den USA haben, erfolgt die Übermittlung auf Grundlage des EU-US Data
          Privacy Framework beziehungsweise der EU-Standardvertragsklauseln.
        </p>
      </section>

      <section>
        <h2>5. Weitergabe an Dienstleister</h2>
        <h3>KI-Modelle für Transkription und Bewertung</h3>
        <p>
          Für die Umwandlung deiner Sprachaufnahme in Text und für den Abgleich deiner Antwort mit deiner Lösung senden
          wir die Aufnahme beziehungsweise Frage, Lösung und Antwort an OpenRouter Inc. (USA), das die Anfrage an das
          jeweilige KI-Modell weiterleitet. Die Daten werden dort nicht zum Training verwendet. Sende keine Daten
          Dritter in Karten, deren Weitergabe nicht zulässig ist.
        </p>
        <h3>Benachrichtigung über Registrierungen</h3>
        <p>
          Bei einer neuen Registrierung erhalten wir eine Nachricht mit E-Mail-Adresse und gegebenenfalls Name über
          den Messenger Telegram (Telegram FZ-LLC, Dubai). Dies dient allein dazu, neue Konten zeitnah zu bemerken.
        </p>
        <h3>Zahlungen</h3>
        <p>
          Beim Kauf eines Tarifs werden die Zahlungsdaten direkt vom Zahlungsdienstleister verarbeitet. Wir erhalten
          keine vollständigen Kartendaten, nur die Bestätigung der Zahlung.
        </p>
      </section>

      <section id="statistik" className="scroll-mt-24">
        <h2>6. Statistik mit DataFast</h2>
        <p>
          Um zu verstehen, wie Kiku gefunden und genutzt wird, messen wir Seitenaufrufe mit DataFast, einem Dienst
          der JustShipIt Pte. Ltd. (Singapur). Die Messung läuft auf der Website und in der App. Inhalte deiner
          Karten, deine Antworten und deine E-Mail-Adresse werden dabei nicht an DataFast übermittelt.
        </p>
        <h3>Welche Daten erfasst werden</h3>
        <ul>
          <li>Adresse der aufgerufenen Seite und die Seite, von der du gekommen bist (Referrer).</li>
          <li>Werbe-Klick-Kennungen aus der Adresse, falls du über eine Anzeige kommst (zum Beispiel gclid oder fbclid).</li>
          <li>Browser- und Gerätetyp, Bildschirm- und Fenstergröße, Sprache und Zeitzone.</li>
          <li>IP-Adresse, aus der DataFast das ungefähre Herkunftsland ableitet.</li>
          <li>Klicks auf Links zu anderen Websites.</li>
        </ul>
        <h3>Ohne deine Einwilligung: Messung ohne Cookies</h3>
        <p>
          Solange du Cookies nicht akzeptiert hast, nutzen wir die Variante von DataFast, die keine Cookies setzt.
          Dabei wird nichts auf deinem Gerät gespeichert und nichts von dort ausgelesen; auch die kurzlebigen
          Kennungen, die DataFast sonst im Sitzungsspeicher des Browsers ablegt, halten wir nur im Arbeitsspeicher
          der geöffneten Seite. Um Besuche zu zählen, bildet DataFast auf seinen Servern aus IP-Adresse, Browsertyp
          und unserer Domain einen Kennwert (Hash) mit einem Zusatzwert, der etwa alle 24 Stunden wechselt. Ein
          Besuch lässt sich damit höchstens innerhalb eines Tages wiedererkennen, nicht über mehrere Tage hinweg.
          Rechtsgrundlage ist unser berechtigtes Interesse, die Reichweite und Nutzung des Angebots in dieser
          datensparsamen Form zu messen (Art. 6 Abs. 1 lit. f DSGVO).
        </p>
        <p>
          Du kannst dieser Messung jederzeit widersprechen (Art. 21 DSGVO). Dann wird DataFast in diesem Browser gar
          nicht mehr geladen:
        </p>
        <p>
          <AnalyticsOptOut />
        </p>
        <h3>Mit deiner Einwilligung: Messung mit Cookies</h3>
        <p>
          Wenn du im Cookie-Hinweis auf „Akzeptieren“ klickst, setzt DataFast ab dem nächsten Seitenaufruf Cookies,
          mit denen wiederkehrende Besuche über mehrere Tage erkannt werden. So sehen wir zum Beispiel, über welchen
          Weg jemand zu Kiku gefunden hat, der sich später registriert. Rechtsgrundlage ist deine Einwilligung
          (Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1 TDDDG).
        </p>
        <ul>
          <li>datafast_visitor_id: zufällige Kennung deines Browsers, 12 Monate.</li>
          <li>datafast_visitor_first_seen_at: Zeitpunkt des ersten Besuchs, 12 Monate.</li>
          <li>datafast_visitor_session_count: Anzahl deiner Besuche, 12 Monate.</li>
          <li>datafast_session_id: Kennung des aktuellen Besuchs, 30 Minuten.</li>
        </ul>
        <p>
          Die Einwilligung ist freiwillig und lässt sich jederzeit mit Wirkung für die Zukunft widerrufen, hier oder
          über den Link im Fuß der Website: <ConsentSettingsButton className="cursor-pointer underline" />. Beim
          Widerruf werden die Cookies gelöscht.
        </p>
        <h3>Empfänger und Drittlandübermittlung</h3>
        <p>
          DataFast verarbeitet die Daten in unserem Auftrag auf Grundlage eines Vertrags zur Auftragsverarbeitung.
          Der Anbieter sitzt in Singapur, seine Server und Unterauftragnehmer befinden sich überwiegend außerhalb der
          EU, unter anderem in den USA. Die Übermittlung erfolgt auf Grundlage der EU-Standardvertragsklauseln
          (Art. 46 Abs. 2 lit. c DSGVO).
        </p>
      </section>

      <section>
        <h2>7. Speicherdauer</h2>
        <p>
          Kontodaten und Lerninhalte speichern wir, bis du dein Konto löschst. Server-Logs werden nach spätestens 30
          Tagen gelöscht. Sprachaufnahmen werden nach der Transkription sofort verworfen. Gesetzliche
          Aufbewahrungspflichten für Rechnungsdaten bleiben unberührt. Die Statistikdaten bei DataFast bleiben
          gespeichert, solange wir den Dienst nutzen; der Kennwert der Messung ohne Cookies lässt sich nach
          spätestens einem Tag keinem Besuch mehr zuordnen.
        </p>
      </section>

      <section>
        <h2>8. Cookies und lokale Speicherung</h2>
        <p>Auf deinem Gerät speichert Kiku Folgendes:</p>
        <ul>
          <li>Ein Sitzungs-Cookie, damit du angemeldet bleibst. Technisch notwendig.</li>
          <li>
            Deine Lerninhalte im Browser, damit die App schnell bleibt und offline nutzbar ist. Beim Abmelden wird
            diese lokale Kopie gelöscht. Technisch notwendig.
          </li>
          <li>Deine Auswahl im Cookie-Hinweis und das gewählte Farbschema (lokaler Speicher). Technisch notwendig.</li>
          <li>Die Statistik-Cookies von DataFast, nur mit deiner Einwilligung (siehe Abschnitt 6).</li>
        </ul>
        <p>
          Werbe-Cookies gibt es nicht. Technisch notwendige Einträge setzen wir auf Grundlage von § 25 Abs. 2 Nr. 2
          TDDDG, alle anderen nur mit deiner Einwilligung.
        </p>
      </section>

      <section>
        <h2>9. Deine Rechte</h2>
        <p>
          Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
          Datenübertragbarkeit und Widerspruch (Art. 15 bis 21 DSGVO). Deine Lerninhalte kannst du jederzeit in den
          Einstellungen als Datei exportieren. Für alles Weitere schreib an{" "}
          <a href="mailto:info@dealzforest.com">info@dealzforest.com</a>. Außerdem kannst du dich bei einer
          Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel beim Hessischen Beauftragten für Datenschutz und
          Informationsfreiheit.
        </p>
      </section>

      <section>
        <h2>10. Selbst gehostete Installationen</h2>
        <p>
          Wer Kiku selbst betreibt, ist für diese Installation selbst verantwortlich. Diese Erklärung gilt nur für
          die von uns betriebene App.
        </p>
      </section>
    </LegalPage>
  );
}
