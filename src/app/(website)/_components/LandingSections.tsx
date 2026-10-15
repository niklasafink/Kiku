import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowRight,
  ArrowUp,
  Camera,
  Check,
  FileText,
  type LucideIcon,
  Package,
  Plus,
  Presentation,
} from "lucide-react";
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
            <span>Klausur Zivilrecht I</span>
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

/** A small tile: its title above a picture drawn for exactly this width. */
function PictureTile({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={TILE}>
      <h3 className={TILE_TITLE}>{title}</h3>
      <div
        className="mt-5 flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl bg-base-200 px-4 py-5"
        aria-hidden
      >
        {children}
      </div>
    </div>
  );
}

/** The round arrow between the two halves of a tile picture. */
function Between({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-content">
      <Icon className="size-4" strokeWidth={2.5} />
    </span>
  );
}

const SOURCES = [
  { icon: FileText, label: "PDF", tilt: "-rotate-3" },
  { icon: Presentation, label: "Folien", tilt: "" },
  { icon: Camera, label: "Foto", tilt: "rotate-3" },
];

/** Three kinds of source material turning into a stack of cards. */
function FromMaterial() {
  return (
    <>
      <div className="grid w-full max-w-[300px] grid-cols-3 gap-2.5">
        {SOURCES.map(({ icon: Icon, label, tilt }) => (
          <span
            key={label}
            className={`flex flex-col items-center gap-1.5 rounded-xl border border-base-300 bg-base-100 py-3 text-xs font-bold ${tilt}`}
          >
            <Icon className="size-6 opacity-70" strokeWidth={1.75} />
            {label}
          </span>
        ))}
      </div>
      <Between icon={ArrowDown} />
      <div className="relative w-full max-w-[300px] pb-4">
        <span className="absolute inset-x-6 top-4 bottom-0 rounded-2xl border border-base-300 bg-base-100" />
        <span className="absolute inset-x-3 top-2 bottom-2 rounded-2xl border border-base-300 bg-base-100" />
        <div className="relative rounded-2xl border border-base-300 bg-base-100 p-3.5">
          <p className="flex items-center justify-between">
            <span className={SECTION_LABEL}>Frage</span>
            <span className="rounded-full bg-base-200 px-2 py-0.5 text-xs font-bold">12 Karten</span>
          </p>
          <p className="mt-1.5 text-sm leading-snug font-bold">Welche Voraussetzungen hat § 823 Abs. 1 BGB?</p>
        </div>
      </div>
    </>
  );
}

/** A row naming a set of cards: in Kiku, or as a file for Anki. */
function Deck({ icon, name, detail }: { icon: React.ReactNode; name: string; detail: string }) {
  return (
    <div className="flex w-full max-w-[300px] items-center gap-3 rounded-2xl border border-base-300 bg-base-100 p-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-base-200 text-xl">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold">{name}</span>
        <span className="block text-xs opacity-70">{detail}</span>
      </span>
    </div>
  );
}

/** A folder in Kiku and the same cards as an Anki package, going both ways. */
function AnkiBothWays() {
  return (
    <>
      <Deck icon="⚖️" name="Jura" detail="48 Karten in Kiku" />
      <Between icon={ArrowDownUp} />
      <Deck icon={<Package className="size-5 opacity-70" />} name="Jura.apkg" detail="Anki-Paket" />
      <div className="flex gap-1.5 font-mono text-xs">
        {[".apkg", ".csv", ".txt"].map((format) => (
          <span key={format} className="rounded-md border border-base-300 bg-base-100 px-1.5 py-0.5">
            {format}
          </span>
        ))}
      </div>
    </>
  );
}

/** Claude's logo mark (Simple Icons), drawn in its brand orange. */
function ClaudeLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
    </svg>
  );
}

const MCP_TOOLS = ["create_folder", "create_cards"];

/** A chat window: the assistant turns notes into cards with Kiku's tools. */
function McpChat() {
  return (
    <div
      className="w-full min-w-0 overflow-hidden rounded-2xl border border-base-300 bg-base-100 text-sm leading-snug shadow-[0_24px_60px_-28px_rgb(0_0_0/0.35)]"
      aria-hidden
    >
      <div className="flex items-center gap-2 border-b border-base-300 px-4 py-2.5 text-xs font-bold">
        <ClaudeLogo className="size-4 text-[#D97757]" />
        Claude
        <span className="ml-auto flex items-center gap-1.5 rounded-full bg-base-200 px-2 py-0.5 font-semibold whitespace-nowrap">
          <span className="size-1.5 rounded-full bg-success" />
          Kiku verbunden
        </span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <p className="max-w-[88%] self-end rounded-2xl rounded-br-sm bg-base-200 px-3.5 py-2">
          Mach aus meinen Notizen zu § 823 BGB Karteikarten im Ordner Zivilrecht.
        </p>
        <ul className="divide-y divide-base-300 rounded-xl border border-base-300 text-xs">
          {MCP_TOOLS.map((tool) => (
            <li key={tool} className="flex items-center gap-2 px-3 py-1.5">
              <Check className="size-3.5 shrink-0 text-success" strokeWidth={3} />
              <span className="truncate font-mono">{tool}</span>
              <span className="ml-auto opacity-60">Kiku</span>
            </li>
          ))}
        </ul>
        <p>
          Erledigt: 6 neue Karten in <strong>Jura › Zivilrecht</strong>, jede mit Frage und Musterlösung.
        </p>
      </div>
      <div className="mx-4 mb-4 flex items-center gap-2 rounded-xl border border-base-300 py-1.5 pr-1.5 pl-3 text-xs">
        <span className="opacity-50">Antworten …</span>
        <span className="ml-auto grid size-6 place-items-center rounded-lg bg-primary text-primary-content">
          <ArrowUp className="size-3.5" strokeWidth={2.5} />
        </span>
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
          <PictureTile title="Karten aus PDF, Folien und Fotos.">
            <FromMaterial />
          </PictureTile>
          <PictureTile title="Anki-Import und -Export.">
            <AnkiBothWays />
          </PictureTile>
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
      "Ja. Mit einem kostenlosen Konto lernst du sofort, mit KI-Auswertung und Sync. Pro prüft genauer und versteht dich beim Sprechen besser. Der Code ist offen, du kannst Kiku auch selbst hosten.",
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
