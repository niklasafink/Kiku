import { Home } from "@/components/Home";
import { Landing } from "@website/Landing";
import { JsonLd } from "@website/JsonLd";
import { HOME_QUESTIONS } from "@/app/(website)/_lib/faq";
import { homeJsonLd, pageMetadata } from "@/app/(website)/_lib/seo";
import { currentUser, SERVER_MODE } from "@/server/auth";

export const metadata = SERVER_MODE
  ? pageMetadata({
      path: "/",
      title: "Kiku: Karteikarten-App mit KI-Abgleich für Active Recall",
      description:
        "Karteikarten lernen mit Active Recall: Antwort sprechen oder tippen, die KI prüft Satz für Satz gegen deine Lösung. Mit Anki-Import und Spaced Repetition.",
    })
  : {};

export default async function HomePage() {
  // Decided on the server so visitors get the homepage with the first response, not after a spinner.
  const visitor = SERVER_MODE && !(await currentUser().catch(() => null));
  return (
    <>
      {SERVER_MODE && <JsonLd data={homeJsonLd(HOME_QUESTIONS)} />}
      <Home visitor={visitor} landing={<Landing />} />
    </>
  );
}
