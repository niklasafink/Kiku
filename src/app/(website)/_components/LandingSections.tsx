import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, Check, Plus } from "lucide-react";
import shotExport from "../_assets/shot-export.png";
import shotGenerate from "../_assets/shot-generate.png";
import shotGraded from "../_assets/shot-graded.png";
import shotInput from "../_assets/shot-input.png";
import shotPhoneMic from "../_assets/shot-phone-mic.png";
import { H2, LEAD, SECTION_LABEL } from "./shared";

/*
 * The homepage below the hero: one headline, at most one line of text and one real screenshot
 * of the app per section. Narrower than the hero so the pictures stay readable.
 */

const COLUMN = "mx-auto w-full max-w-[1200px] px-5 lg:px-8";
const SECTION = "scroll-mt-[84px] py-20 lg:py-28";
const SHOT = "overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-[0_24px_70px_-24px_rgb(0_0_0/0.28)]";
const TILE = "relative flex min-h-[340px] min-w-0 flex-col overflow-hidden rounded-3xl border border-base-300 bg-base-100 p-6 sm:p-7";
const TILE_TITLE = "text-2xl leading-tight font-bold tracking-tight text-balance";

/** A screenshot under its one-line title. */
function Step({ title, image, alt }: { title: string; image: StaticImageData; alt: string }) {
  return (
    <figure className="flex min-w-0 flex-col gap-4">
      <figcaption className="text-center text-lg font-bold">{title}</figcaption>
      <div className={SHOT}>
        <Image src={image} alt={alt} sizes="(min-width: 1024px) 520px, 100vw" />
      </div>
    </figure>
  );
}

/** Answering on the left, the graded solution of the same card on the right. */
export function Graded() {
  return (
    <section id="bewertung" className={`${SECTION} bg-base-200`}>
      <div className={`${COLUMN} text-center`}>
        <h2 className={H2}>Du siehst, was sitzt.</h2>
        <p className={LEAD}>Jede Karte hat einen Score. Schwache übst du zuerst.</p>
      </div>
      <div className={`${COLUMN} mt-12 grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr]`}>
        <Step
          title="Du antwortest."
          image={shotInput}
          alt="Antwort einsprechen, tippen oder mit dem Stift schreiben"
        />
        <span
          className="grid size-14 place-items-center justify-self-center rounded-full bg-primary text-primary-content shadow-[0_12px_30px_-12px_rgb(0_0_0/0.4)] max-lg:rotate-90 lg:mt-11"
          aria-hidden
        >
          <ArrowRight className="size-6" strokeWidth={2.5} />
        </span>
        <Step
          title="Kiku vergleicht mit der Lösung."
          image={shotGraded}
          alt="Die Lösung derselben Karte: genannte Sätze grün, fehlende grau, ein widersprüchlicher rot"
        />
      </div>
    </section>
  );
}

const RATINGS = ["Nochmal", "Schwer", "Gut", "Einfach"];

/** What a student said to themself, under the picture it belongs to. */
function Thought({ children }: { children: string }) {
  return (
    <span className="self-start rounded-full border border-base-300 bg-base-100 px-3.5 py-2 text-sm font-semibold opacity-80">
      {children}
    </span>
  );
}

/** A flashcard rated "Gut" while studying, next to the empty exam sheet three weeks later. */
function ThenAndNow() {
  return (
    <div className="grid gap-4 rounded-3xl bg-base-200 p-5 sm:grid-cols-2" aria-hidden>
      <div className="flex min-w-0 flex-col gap-3">
        <span className={`${SECTION_LABEL} pl-1`}>Beim Lernen</span>
        <div className="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-[0_3px_0_0_var(--color-base-300)]">
          <p className="leading-snug font-bold">Welche Voraussetzungen hat § 823 Abs. 1 BGB?</p>
          <p className="mt-2.5 text-sm leading-relaxed opacity-70">
            Rechtsgutverletzung, Verletzungshandlung, haftungsbegründende Kausalität, Rechtswidrigkeit, Verschulden,
            Schaden, haftungsausfüllende Kausalität.
          </p>
          <div className="mt-3.5 grid grid-cols-4 gap-1.5 text-center text-xs font-bold">
            {RATINGS.map((rating) =>
              rating === "Gut" ? (
                <span
                  key={rating}
                  className="flex items-center justify-center gap-1 rounded-lg bg-success/25 py-2 ring-2 ring-success"
                >
                  {rating}
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              ) : (
                <span key={rating} className="rounded-lg border border-base-300 py-2">
                  {rating}
                </span>
              ),
            )}
          </div>
        </div>
        <Thought>„Ja klar, kenn ich.“</Thought>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <span className={`${SECTION_LABEL} pl-1`}>In der Klausur</span>
        <div className="rounded-md border border-base-300 bg-base-100 px-4 pt-4 pb-6 shadow-[0_3px_0_0_var(--color-base-300)]">
          <p className="flex justify-between border-b border-base-300 pb-2 text-[0.7rem] font-bold tracking-wide uppercase opacity-60">
            <span>Zivilrecht I · Klausur</span>
            <span>Aufgabe 2</span>
          </p>
          <p className="mt-3 text-[0.95rem] leading-snug font-bold">
            Prüfen Sie die Voraussetzungen eines Anspruchs aus § 823 Abs. 1 BGB.
          </p>
          <div className="mt-6 flex flex-col gap-4">
            {[0, 1, 2, 3, 4].map((line) => (
              <span key={line} className="relative block h-px bg-base-300">
                {line === 0 && (
                  <span className="absolute bottom-0.5 left-0 h-4 w-0.5 animate-pulse bg-base-content motion-reduce:animate-none" />
                )}
              </span>
            ))}
          </div>
        </div>
        <Thought>„Rechtsgut … Schaden … und dann?“</Thought>
      </div>
    </div>
  );
}

/** The problem with flipping cards, asked as a question. */
export function Problem() {
  return (
    <section id="problem" className={SECTION}>
      <div className="mx-auto grid w-full max-w-[1320px] items-center gap-12 px-5 lg:grid-cols-[1fr_1.35fr] lg:gap-16 lg:px-8">
        <div>
          <h2 className={H2}>Kennst du das? Beim Lernen klingt alles bekannt.</h2>
          <p className={`${LEAD} max-w-[40ch]`}>
            Karte umdrehen, „ja, wusste ich“, weiter. Drei Wochen später in der Klausur: nichts davon da.
          </p>
          <p className="mt-5 font-bold">Bei Kiku musst du es selbst sagen. Genau das bleibt.</p>
        </div>
        <ThenAndNow />
      </div>
    </section>
  );
}

/** A small tile: its title, and a screenshot running out of the bottom edge. */
function ShotTile({ title, image, alt }: { title: string; image: StaticImageData; alt: string }) {
  return (
    <div className={TILE}>
      <h3 className={TILE_TITLE}>{title}</h3>
      <div className="relative -mx-6 mt-5 -mb-6 min-h-52 flex-1 overflow-hidden rounded-t-xl border-t border-base-300 sm:-mx-7 sm:-mb-7">
        <Image src={image} alt={alt} fill sizes="(min-width: 768px) 400px, 100vw" className="object-cover object-left-top" />
      </div>
    </div>
  );
}

const MCP_TOOLS = ["get_overview", "create_folder", "create_cards"];

/** An assistant turning notes into cards over MCP. */
function McpChat() {
  return (
    <div className="flex min-w-0 flex-col gap-2.5 text-[0.92rem] leading-snug" aria-hidden>
      <div className="flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full border border-base-300 bg-base-100 text-xs font-extrabold">
          Du
        </span>
        <p className="rounded-2xl rounded-tl-sm border border-base-300 bg-base-100 px-3.5 py-2.5">
          Mach mir aus meinen Notizen zu § 823 BGB Karteikarten im Ordner Zivilrecht.
        </p>
      </div>
      <div className="flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-content">
          <Bot className="size-4" />
        </span>
        <div className="min-w-0 rounded-2xl rounded-tl-sm border border-base-300 bg-base-100 px-3.5 py-2.5">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {MCP_TOOLS.map((tool) => (
              <span key={tool} className="rounded-md bg-base-200 px-1.5 py-0.5 font-mono text-xs">
                {tool}
              </span>
            ))}
          </div>
          <p>
            Erledigt: 6 neue Karten in <strong>Jura › Zivilrecht</strong>, jede mit Frage und Musterlösung.
          </p>
          <ul className="mt-2 list-disc pl-5 font-semibold">
            <li>Voraussetzungen § 823 Abs. 1 BGB</li>
            <li>Geschützte Rechtsgüter</li>
            <li>Haftungsbegründende Kausalität</li>
            <li className="opacity-60">+ 3 weitere</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Four features in a bento grid: two wide tiles on opposite corners, two small ones. */
export function Features() {
  return (
    <section id="features" className={`${SECTION} bg-base-200`}>
      <div className={COLUMN}>
        <h2 className={`${H2} text-center`}>Alles, was du zum Lernen brauchst.</h2>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          <div
            className={`${TILE} items-center gap-6 bg-linear-to-br from-success/20 to-base-100 sm:grid sm:grid-cols-2 md:col-span-2`}
          >
            <h3 className={`${TILE_TITLE} max-sm:self-start`}>Unterwegs mit Handy lernen.</h3>
            <div className="w-full max-w-[220px] justify-self-center overflow-hidden rounded-[1.6rem] border-[5px] border-neutral bg-base-100 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.4)]">
              <Image src={shotPhoneMic} alt="Kiku auf dem Handy: Frage und Mikrofon-Knopf" sizes="220px" />
            </div>
          </div>
          <ShotTile
            title="Karten aus PDF, Folien und Fotos."
            image={shotGenerate}
            alt="Karten aus Unterlagen: Datei wählen oder Text einfügen"
          />
          <ShotTile
            title="Anki-Import und -Export."
            image={shotExport}
            alt="Karten exportieren als Tabelle, Anki-Paket oder Text"
          />
          <div
            className={`${TILE} items-center gap-6 border-transparent bg-primary/10 sm:grid sm:grid-cols-2 md:col-span-2`}
          >
            <h3 className={`${TILE_TITLE} max-sm:self-start`}>Claude schreibt deine Karten. Per MCP.</h3>
            <McpChat />
          </div>
        </div>
      </div>
    </section>
  );
}

const QUESTIONS = [
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
      "Der Code ist offen. Selbst gehostet kostet Kiku nichts, mit eigenem API-Key auch mit KI. Gehostet mit Sync gibt es Pro.",
  },
];

export function Questions() {
  return (
    <section id="faq" className={SECTION}>
      <div className={COLUMN}>
        <h2 className={`${H2} text-center`}>Häufige Fragen</h2>
        <div className="mx-auto mt-10 max-w-[760px] border-b border-base-300">
          {QUESTIONS.map((item) => (
            <details key={item.question} className="group border-t border-base-300">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4.5 text-lg font-bold [&::-webkit-details-marker]:hidden">
                {item.question}
                <Plus
                  className="size-5 shrink-0 opacity-60 transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none"
                  aria-hidden
                />
              </summary>
              <p className="pb-5 leading-relaxed text-pretty opacity-70">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The closing band in the brand colour. */
export function Closing() {
  return (
    <section className="bg-primary py-20 text-primary-content lg:py-28">
      <div className={`${COLUMN} flex flex-col items-center gap-7 text-center`}>
        <h2 className={H2}>Lern so, wie du geprüft wirst.</h2>
        <Link
          href="/auth/sign-up"
          className="inline-flex h-12 items-center gap-2 rounded-md bg-base-100 px-5 font-semibold text-primary hover:brightness-95"
        >
          Kostenlos starten
          <ArrowRight className="size-5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
