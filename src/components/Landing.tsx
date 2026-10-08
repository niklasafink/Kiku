import Link from "next/link";
import { ArrowRight, Mic, PenLine, Sparkles } from "lucide-react";
import { MarketingHeader } from "@/components/MarketingHeader";

const SECTION_HEADING = "text-xs font-extrabold tracking-wide uppercase opacity-60";

const STEPS = [
  {
    icon: PenLine,
    title: "Karte mit deiner Lösung anlegen",
    text: "Frage und deine eigene Musterlösung. Einzeln eintippen oder gleich eine ganze Tabelle importieren.",
  },
  {
    icon: Mic,
    title: "Antwort sprechen oder tippen",
    text: "Sag die Antwort so, wie du sie in der Prüfung sagen würdest. In deinen eigenen Worten, so lang wie nötig.",
  },
  {
    icon: Sparkles,
    title: "Sehen, was gefehlt hat",
    text: "Die KI markiert in deiner Lösung, was du genannt hast und was nicht. Der Verlauf zeigt, ob du besser wirst.",
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t-2 border-base-300 bg-base-100 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-5 text-sm sm:px-6">
        <span className="mr-auto font-bold">Kiku</span>
        <Link href="/pricing" className="link-hover link">
          Preise
        </Link>
        <Link href="/auth/sign-in" className="link-hover link">
          Anmelden
        </Link>
        <Link href="/impressum" className="link-hover link">
          Impressum
        </Link>
      </div>
    </footer>
  );
}

/** What a graded answer looks like, built from the same pieces as the real result screen. */
function ResultPreview() {
  return (
    <div className="flex flex-col gap-3">
      <div className="tile p-5">
        <p className={SECTION_HEADING}>Frage</p>
        <p className="mt-1.5 text-lg font-extrabold">Was passiert bei der Mitose und welche Phasen gibt es?</p>
      </div>
      <div className="tile flex items-center gap-4 p-5">
        <div
          className="radial-progress shrink-0 font-black text-success"
          style={{ "--value": 82, "--size": "4rem", "--thickness": "0.45rem" } as React.CSSProperties}
          role="img"
          aria-label="82 Prozent"
        >
          <span className="text-sm text-base-content">82 %</span>
        </div>
        <div>
          <p className="font-extrabold">Stark, fast alles dabei!</p>
          <p className="text-sm opacity-70">Letztes Mal: 68 %</p>
        </div>
      </div>
      <div className="tile p-5">
        <p className={SECTION_HEADING}>Lösung</p>
        <p className="mt-1.5 leading-loose">
          <span className="seg seg-correct">
            Die Mitose ist die Kernteilung, bei der aus einer Mutterzelle zwei genetisch identische Tochterzellen
            entstehen.
          </span>{" "}
          <span className="seg seg-correct">Prophase: Die Chromosomen kondensieren</span>{" "}
          <span className="seg seg-missing">und die Kernhülle löst sich auf.</span>{" "}
          <span className="seg seg-correct">Metaphase: Die Chromosomen ordnen sich in der Äquatorialebene an.</span>{" "}
          <span className="seg seg-unsure">Anaphase: Die Chromosomen werden verdoppelt.</span>
        </p>
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <li>
            <span className="seg seg-correct">Genannt</span>
          </li>
          <li>
            <span className="seg seg-missing">Nicht genannt</span>
          </li>
          <li>
            <span className="seg seg-unsure">Unsicher oder widersprüchlich</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

export function Landing() {
  return (
    <div className="flex min-h-dvh flex-col bg-base-200">
      <MarketingHeader />
      <main className="flex-1">
        <section className="mx-auto grid w-full max-w-5xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:py-20">
          <div className="flex flex-col items-start gap-5">
            <h1 className="text-4xl leading-tight font-black text-balance sm:text-5xl">
              Karteikarten, die prüfen, was du wirklich gesagt hast.
            </h1>
            <p className="text-lg opacity-80">
              Du sprichst oder tippst deine Antwort. Die KI gleicht sie mit deiner Lösung ab und zeigt dir Satz für
              Satz, was saß und was gefehlt hat.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link href="/auth/sign-up" className="btn btn-primary btn-chunky btn-lg">
                Jetzt starten
                <ArrowRight className="size-5" aria-hidden />
              </Link>
              <Link href="/pricing" className="btn btn-ghost btn-lg">
                Preise ansehen
              </Link>
            </div>
          </div>
          <ResultPreview />
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
          <p className={SECTION_HEADING}>So funktioniert es</p>
          <h2 className="mt-1 text-3xl font-black">Lernen wie in der mündlichen Prüfung</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="tile flex flex-col gap-2 p-5">
                <span className="grid size-11 place-items-center rounded-field bg-primary/10 text-primary">
                  <step.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-1 text-lg font-extrabold">
                  {i + 1}. {step.title}
                </h3>
                <p className="opacity-80">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 lg:pb-20">
          <div className="tile flex flex-col items-center gap-4 p-8 text-center sm:p-12">
            <h2 className="text-3xl font-black text-balance">Leg deine erste Karte an</h2>
            <p className="max-w-xl text-lg opacity-80">
              Ab 2 € im Monat mit 300 KI-Verarbeitungen. Oder einmal kaufen und behalten.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-1">
              <Link href="/auth/sign-up" className="btn btn-primary btn-chunky btn-lg">
                Jetzt starten
              </Link>
              <Link href="/pricing" className="btn btn-ghost btn-lg">
                Alle Tarife
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
