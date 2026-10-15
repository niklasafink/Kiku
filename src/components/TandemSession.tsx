"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleQuestionMark,
  Eye,
  EyeOff,
  Headphones,
  MessageCircle,
  MessagesSquare,
  Presentation,
  RotateCcw,
  SendHorizontal,
  SkipForward,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { useAccount } from "@/components/Account";
import { Recorder } from "@/components/Recorder";
import { RichText } from "@/components/RichText";
import { pluralize } from "@/lib/format";
import { DEVICE_VOICE, setTandemVoice, useTandemVoice, type TandemVoiceSetting } from "@/lib/settings";
import { canSpeak, speak, stopSpeaking } from "@/lib/speak";
import { shuffled } from "@/lib/study";
import {
  knowledgeOf,
  MAX_HISTORY,
  MAX_MESSAGE_CHARS,
  TANDEM_VOICES,
  tandemCard,
  type TandemCard,
  type TandemMessage,
  type TandemMode,
} from "@/lib/tandem";
import { folderOptions } from "@/lib/tree";
import type { Card, Folder } from "@/lib/types";

const MODES: { id: TandemMode; icon: typeof MessageCircle; title: string; text: string }[] = [
  {
    id: "quiz",
    icon: CircleQuestionMark,
    title: "Abfragen",
    text: "Kiku stellt die Fragen deiner Karten. Ihr erarbeitet die Antwort zusammen, mit Hinweisen statt fertiger Lösungen.",
  },
  {
    id: "teach",
    icon: Presentation,
    title: "Ich erkläre",
    text: "Du erklärst Kiku ein Thema nach dem anderen. Kiku hakt dort nach, wo es noch vage ist.",
  },
  {
    id: "free",
    icon: MessageCircle,
    title: "Frei sprechen",
    text: "Kein fester Ablauf: Frag, was du zum Stoff dieses Ordners wissen willst.",
  },
];

const NEXT_CARD = "Lass uns zur nächsten Karte gehen.";
// The shortest valid WAV: played on the first tap, so later replies may start without one.
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

interface SessionCard {
  card: Card;
  plain: TandemCard;
}

type Phase = "idle" | "thinking" | "speaking";

/** Reads a response of one JSON value per line. */
async function* jsonLines(response: Response): AsyncGenerator<Record<string, unknown>> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let end: number;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (line) yield JSON.parse(line);
    }
    if (done) return;
  }
}

/** A spoken conversation with the AI about the cards of a folder. */
export function TandemSession({ folder, folders, cards }: { folder: Folder; folders: Folder[]; cards: Card[] }) {
  const router = useRouter();
  const account = useAccount();
  // Free accounts dictate with the browser's speech recognition and hear the voice of their device.
  const freePlan = account.mode === "server" && account.user?.plan === "free";
  const storedVoice = useTandemVoice();
  const voice: TandemVoiceSetting = freePlan ? DEVICE_VOICE : storedVoice;

  const usable = useMemo<SessionCard[]>(
    () =>
      cards.flatMap((card) => {
        const plain = tandemCard(card);
        return plain ? [{ card, plain }] : [];
      }),
    [cards],
  );
  const knowledge = useMemo(() => knowledgeOf(usable.map((entry) => entry.plain)), [usable]);

  const [mode, setMode] = useState<TandemMode>("quiz");
  const [shuffle, setShuffle] = useState(false);
  const [started, setStarted] = useState(false);
  const [session, setSession] = useState<SessionCard[]>([]);
  const [index, setIndex] = useState(0);
  const [messages, setMessages] = useState<TandemMessage[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const [draft, setDraft] = useState("");
  // Hands-free: after each reply the microphone opens by itself and closes after a pause.
  const [handsFree, setHandsFree] = useState(false);
  const [listen, setListen] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);

  // What a running turn works on. The state above mirrors it for rendering.
  const live = useRef({ session: [] as SessionCard[], index: 0, messages: [] as TandemMessage[], done: false, handsFree: false });
  // Counts the turns: a reply that arrives after the user moved on is dropped.
  const turnId = useRef(0);
  const request = useRef<AbortController | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const endPlayback = useRef<() => void>(() => {});
  const bottom = useRef<HTMLDivElement>(null);

  function silence() {
    player.current?.pause();
    endPlayback.current();
    stopSpeaking();
  }

  useEffect(
    () => () => {
      turnId.current += 1;
      request.current?.abort();
      silence();
    },
    [],
  );

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages.length, phase]);

  function play(base64: string): Promise<void> {
    return new Promise((resolve) => {
      const audio = player.current;
      if (!audio) return resolve();
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
      const finish = () => {
        audio.onended = audio.onerror = null;
        endPlayback.current = () => {};
        URL.revokeObjectURL(url);
        resolve();
      };
      endPlayback.current = finish;
      audio.onended = audio.onerror = finish;
      audio.src = url;
      audio.play().catch(finish);
    });
  }

  /** Sends what the user said (or nothing, to open the session or to try again) and plays the reply. */
  async function turn(text: string | null) {
    const state = live.current;
    const id = ++turnId.current;
    request.current?.abort();
    const abort = new AbortController();
    request.current = abort;
    silence();

    if (text) {
      // Two contributions in a row, e.g. after a failed request, become one.
      const last = state.messages[state.messages.length - 1];
      const said = (last?.role === "user" ? `${last.text} ${text}` : text).slice(0, MAX_MESSAGE_CHARS);
      state.messages = [...(last?.role === "user" ? state.messages.slice(0, -1) : state.messages), { role: "user", text: said }];
      setMessages(state.messages);
    }
    setError(null);
    setPhase("thinking");

    const onCards = mode !== "free";
    try {
      const response = await fetch("/api/tandem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          mode,
          folder: folder.name,
          knowledge,
          card: onCards ? (state.session[state.index]?.plain ?? null) : null,
          next: onCards ? (state.session[state.index + 1]?.plain ?? null) : null,
          position: state.index + 1,
          total: state.session.length,
          // An odd number, so the part that is sent starts with the user as well as ending with them.
          messages: state.messages.slice(-(MAX_HISTORY - 1)),
          voice: voice === DEVICE_VOICE ? null : voice,
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Die Anfrage ist fehlgeschlagen. Bitte versuche es noch einmal.");
      }
      const lines = jsonLines(response);
      const reply = (await lines.next()).value as { text: string; advance: boolean; voiced: boolean; remaining: number | null };
      if (id !== turnId.current) return;

      state.messages = [...state.messages, { role: "assistant", text: reply.text }];
      setMessages(state.messages);
      setRemaining(reply.remaining);
      if (reply.advance && onCards) {
        if (state.index + 1 < state.session.length) {
          state.index += 1;
          setIndex(state.index);
          setShowSolution(false);
        } else {
          state.done = true;
          setDone(true);
        }
      }
      setPhase("speaking");

      const audio = reply.voiced ? (((await lines.next().catch(() => null))?.value?.audio as string | null | undefined) ?? null) : null;
      if (id !== turnId.current) return;
      if (audio) await play(audio);
      else await speak(reply.text);
      if (id !== turnId.current) return;
      setPhase("idle");
      if (state.handsFree && !state.done) setListen((n) => n + 1);
    } catch (e) {
      if (abort.signal.aborted || id !== turnId.current) return;
      setError(
        !navigator.onLine
          ? "Das Tandem braucht eine Internetverbindung."
          : e instanceof Error && e.message
            ? e.message
            : "Die Anfrage ist fehlgeschlagen. Bitte versuche es noch einmal.",
      );
      setPhase("idle");
    }
  }

  function start() {
    // Playing sound later, when a reply arrives, is only allowed after it was started once by a tap.
    const audio = new Audio(SILENCE);
    void audio.play().catch(() => {});
    player.current = audio;
    if (canSpeak()) window.speechSynthesis.speak(new SpeechSynthesisUtterance(" "));

    const order = shuffle && mode !== "free" ? shuffled(usable) : usable;
    live.current = { session: order, index: 0, messages: [], done: false, handsFree: false };
    setSession(order);
    setIndex(0);
    setMessages([]);
    setDone(false);
    setShowSolution(false);
    setHandsFree(false);
    setStarted(true);
    void turn(null);
  }

  /** Stops the reply that is being spoken and hands the word back to the user. */
  function interrupt() {
    turnId.current += 1;
    silence();
    setPhase("idle");
  }

  function sendDraft() {
    const text = draft.trim();
    if (!text || phase === "thinking") return;
    setDraft("");
    void turn(text);
  }

  if (usable.length === 0) {
    return (
      <div className="tile mx-auto w-full max-w-xl p-8 text-center">
        <p className="text-lg font-bold">In diesem Ordner gibt es noch keine Karten mit Text, über die ihr sprechen könntet.</p>
        <Link href={`/f/${folder.id}`} className="btn btn-primary btn-chunky mt-4">
          Zurück zum Ordner
        </Link>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="tile pop-in mx-auto flex w-full max-w-xl flex-col gap-5 p-6 sm:p-8">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black">
            <MessagesSquare className="size-6 text-primary" /> Lerntandem
          </h1>
          <p className="mt-1 opacity-70">
            Sprich mit Kiku über deine Karten, wie mit jemandem, der mit dir für dieselbe Prüfung lernt.
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">Worüber sprecht ihr?</span>
          <select className="select w-full" value={folder.id} onChange={(e) => router.replace(`/f/${e.target.value}/tandem`)}>
            {folderOptions(folders).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="text-sm opacity-70">
            {knowledge.length < usable.length
              ? `Der Ordner ist sehr groß: Kiku kennt die ersten ${knowledge.length} von ${usable.length} Karten. Für den Rest wähle einen Unterordner.`
              : `Kiku kennt ${pluralize(usable.length, "Karte", "Karten")} aus diesem Ordner und seinen Unterordnern.`}
          </span>
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-bold">Wie wollt ihr lernen?</legend>
          {MODES.map(({ id, icon: Icon, title, text }) => (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              onClick={() => setMode(id)}
              className={`flex items-start gap-3 rounded-box border-2 p-3 text-left ${mode === id ? "border-primary bg-primary/10" : "border-base-300 bg-base-100"}`}
            >
              <Icon className={`mt-0.5 size-5 shrink-0 ${mode === id ? "text-primary" : "opacity-60"}`} />
              <span>
                <span className="block font-extrabold">{title}</span>
                <span className="block text-sm opacity-70">{text}</span>
              </span>
            </button>
          ))}
        </fieldset>

        {mode !== "free" && usable.length > 1 && (
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" className="checkbox checkbox-sm" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
            Karten mischen
          </label>
        )}

        {freePlan ? (
          <p className="text-sm opacity-70">Im kostenlosen Tarif spricht Kiku mit der Stimme deines Geräts. Mit Pro bekommt Kiku eine natürliche Stimme.</p>
        ) : (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">Kikus Stimme</span>
            <select className="select w-full" value={voice} onChange={(e) => setTandemVoice(e.target.value as TandemVoiceSetting)}>
              {TANDEM_VOICES.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
              <option value={DEVICE_VOICE}>Stimme des Geräts</option>
            </select>
          </label>
        )}

        <div className="flex flex-wrap justify-end gap-2.5">
          <Link href={`/f/${folder.id}`} className="btn btn-ghost">
            Abbrechen
          </Link>
          <button className="btn btn-primary btn-chunky" onClick={start}>
            <MessagesSquare className="size-4" /> Gespräch starten
          </button>
        </div>
      </div>
    );
  }

  const current = mode === "free" ? null : session[index];
  const modeTitle = MODES.find((entry) => entry.id === mode)!.title;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href={`/f/${folder.id}`} className="btn btn-ghost btn-square btn-sm" aria-label="Tandem beenden">
          <X className="size-5" />
        </Link>
        <p className="min-w-0 flex-1 truncate font-extrabold">
          {modeTitle}: <span className="font-bold opacity-60">{folder.name}</span>
        </p>
        {current && (
          <span className="badge badge-ghost font-extrabold tabular-nums">
            {index + 1} / {session.length}
          </span>
        )}
        {!freePlan && (
          <button
            className={`btn btn-sm ${handsFree ? "btn-primary" : "btn-ghost"}`}
            aria-pressed={handsFree}
            onClick={() => {
              live.current.handsFree = !handsFree;
              setHandsFree(!handsFree);
              if (!handsFree && phase === "idle" && !done) setListen((n) => n + 1);
            }}
            title="Nach jeder Antwort von Kiku hört das Mikrofon von selbst zu und sendet nach einer kurzen Pause"
          >
            <Headphones className="size-4" />
            <span className="hidden sm:inline">Freihand</span>
          </button>
        )}
      </div>

      {current && (
        <section className="tile flex flex-col gap-3 p-5">
          <RichText text={current.card.question} className="font-bold" />
          {showSolution && (
            <div className="border-t-2 border-base-300 pt-3">
              <RichText text={current.card.solution} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-sm bg-base-200" onClick={() => setShowSolution(!showSolution)}>
              {showSolution ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              {showSolution ? "Lösung verbergen" : "Lösung zeigen"}
            </button>
            {!done && (
              <button className="btn btn-sm bg-base-200" onClick={() => void turn(NEXT_CARD)} disabled={phase === "thinking"}>
                <SkipForward className="size-4" /> {index + 1 < session.length ? "Nächste Karte" : "Abschließen"}
              </button>
            )}
          </div>
        </section>
      )}

      <div className="flex flex-col" aria-live="polite">
        {messages.map((message, i) => (
          <div key={i} className={`chat ${message.role === "user" ? "chat-end" : "chat-start"}`}>
            <div className={`chat-bubble whitespace-pre-wrap ${message.role === "user" ? "chat-bubble-primary" : ""}`}>{message.text}</div>
          </div>
        ))}
        {phase === "thinking" && (
          <div className="chat chat-start">
            <div className="chat-bubble">
              <span className="loading loading-dots loading-sm" aria-label="Kiku überlegt" />
            </div>
          </div>
        )}
        <div ref={bottom} />
      </div>

      {error && (
        <div role="alert" className="alert alert-error alert-soft text-sm">
          <span className="flex-1">{error}</span>
          <button className="btn btn-sm" onClick={() => void turn(null)}>
            <RotateCcw className="size-4" /> Nochmal
          </button>
        </div>
      )}

      {done ? (
        <div className="tile pop-in flex flex-col items-center gap-3 p-6 text-center">
          <p className="text-lg font-black">Alle {pluralize(session.length, "Karte", "Karten")} besprochen.</p>
          <div className="flex flex-wrap justify-center gap-2.5">
            <button
              className="btn btn-chunky bg-base-200"
              onClick={() => {
                interrupt();
                setStarted(false);
              }}
            >
              <RotateCcw className="size-4" /> Neues Gespräch
            </button>
            <Link href={`/f/${folder.id}`} className="btn btn-primary btn-chunky">
              Zurück zum Ordner
            </Link>
          </div>
        </div>
      ) : (
        <div className="sticky bottom-0 -mx-2 flex flex-col gap-2 rounded-t-box bg-base-200/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur">
          {phase === "speaking" && (
            <button className="btn btn-sm self-center bg-base-100" onClick={interrupt}>
              <Volume2 className="size-4 text-primary" /> Kiku spricht
              <Square className="size-3" fill="currentColor" aria-label="Stoppen" />
            </button>
          )}
          <div className="flex items-start gap-3">
            <Recorder
              compact
              label="Sprechen"
              browser={freePlan}
              disabled={phase === "thinking"}
              autoStart={handsFree ? listen : 0}
              stopAfterSilence={handsFree ? 2200 : undefined}
              onStart={interrupt}
              onTranscript={(text) => void turn(text)}
            />
            <form
              className="flex min-w-0 flex-1 items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                sendDraft();
              }}
            >
              <label className="min-w-0 flex-1">
                <span className="sr-only">Nachricht tippen</span>
                <textarea
                  className="textarea min-h-12 w-full"
                  rows={1}
                  placeholder="Oder tippen …"
                  value={draft}
                  maxLength={MAX_MESSAGE_CHARS}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      sendDraft();
                    }
                  }}
                />
              </label>
              <button type="submit" className="btn btn-primary btn-square btn-chunky" disabled={!draft.trim() || phase === "thinking"} aria-label="Senden">
                <SendHorizontal className="size-4" />
              </button>
            </form>
          </div>
          {remaining !== null && remaining <= 20 && (
            <p className="text-center text-xs font-bold opacity-70">Noch {remaining} KI-Anfragen in diesem Monat.</p>
          )}
        </div>
      )}
    </div>
  );
}
