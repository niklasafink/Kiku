"use client";

import { useEffect, useId, useRef, useState } from "react";
import { RotateCcw, Square, Timer } from "lucide-react";

const PRESETS = [15, 30, 45, 60];
const KEY = "kiku-pomodoro";
const MAX_MINUTES = 600;

/** The end is stored, not the time left, so the timer runs on while the page is closed or another session is open. */
type Stored = { minutes: number; endsAt: number | null };

function stored(): Stored {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "") as Stored;
    if (typeof value.minutes === "number") return { minutes: value.minutes, endsAt: typeof value.endsAt === "number" ? value.endsAt : null };
  } catch {
    // Nothing stored yet, or private browsing.
  }
  return { minutes: 30, endsAt: null };
}

function store(value: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Private browsing: the timer just ends with the page.
  }
}

function clock(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Three short tones and a buzz on phones, so the end is noticed while writing. */
function ring(audio: AudioContext | null) {
  navigator.vibrate?.([200, 100, 200]);
  if (!audio) return;
  void audio.resume();
  for (let i = 0; i < 3; i++) {
    const start = audio.currentTime + i * 0.35;
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
    tone.connect(gain).connect(audio.destination);
    tone.start(start);
    tone.stop(start + 0.3);
  }
}

/**
 * A study timer over the whole session, not per card: a small clock in the bar that opens a
 * picker with the usual lengths, a field for any other, and a reset that starts it over.
 */
export function Pomodoro() {
  const [timer, setTimer] = useState<Stored>(stored);
  const [now, setNow] = useState(() => Date.now());
  const [custom, setCustom] = useState("");
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Created on the tap that starts the timer, since browsers only allow sound after one.
  const audio = useRef<AudioContext | null>(null);
  const rang = useRef(false);
  const id = useId();

  const left = timer.endsAt === null ? null : timer.endsAt - now;
  const running = left !== null && left > 0;
  const done = left !== null && left <= 0;

  useEffect(() => {
    if (timer.endsAt === null) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [timer.endsAt]);

  useEffect(() => {
    if (done && !rang.current) {
      rang.current = true;
      ring(audio.current);
    }
  }, [done]);

  function update(next: Stored) {
    setTimer(next);
    store(next);
  }

  function start(minutes: number) {
    if (!(minutes > 0)) return;
    minutes = Math.min(MAX_MINUTES, Math.round(minutes));
    try {
      audio.current ??= new AudioContext();
    } catch {
      // Without Web Audio the end is only shown.
    }
    rang.current = false;
    setNow(Date.now());
    update({ minutes, endsAt: Date.now() + minutes * 60_000 });
    setCustom("");
    panel.current?.hidePopover();
  }

  function stop() {
    update({ ...timer, endsAt: null });
    panel.current?.hidePopover();
  }

  // The bar scrolls sideways on tablets, so the panel is a popover in the top layer, placed under the button.
  function place() {
    const box = button.current?.getBoundingClientRect();
    const el = panel.current;
    if (!box || !el) return;
    el.style.top = `${box.bottom + 6}px`;
    el.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - el.offsetWidth - 8))}px`;
  }

  return (
    <>
      <button
        ref={button}
        popoverTarget={id}
        className={`btn btn-sm shrink-0 ${timer.endsAt === null ? "btn-ghost btn-square" : done ? "btn-warning animate-pulse px-2" : "btn-ghost px-2 font-extrabold tabular-nums"}`}
        aria-label={timer.endsAt === null ? "Lerntimer" : done ? "Lerntimer abgelaufen" : `Lerntimer, noch ${clock(left ?? 0)}`}
        title={timer.endsAt === null ? "Lerntimer (Pomodoro)" : done ? "Zeit ist um" : "Lerntimer"}
      >
        {timer.endsAt === null ? <Timer className="size-4" /> : done ? "0:00" : clock(left ?? 0)}
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        onToggle={(event) => event.newState === "open" && place()}
        className="fixed inset-auto m-0 w-64 rounded-box border-2 border-base-300 bg-base-100 p-3 text-base-content shadow-lg"
      >
        {timer.endsAt !== null && (
          <div className="mb-3 flex items-center gap-2">
            <span className="flex-1 text-sm font-semibold">
              {done ? "Zeit ist um." : `Noch ${clock(left ?? 0)} von ${timer.minutes} Min.`}
            </span>
            <button className="btn btn-sm btn-square bg-base-100" onClick={() => start(timer.minutes)} title={`Neu starten mit ${timer.minutes} Minuten`} aria-label="Neu starten">
              <RotateCcw className="size-4" />
            </button>
            <button className="btn btn-sm btn-square bg-base-100" onClick={stop} title="Timer beenden" aria-label="Timer beenden">
              <Square className="size-4" />
            </button>
          </div>
        )}
        <div className="join w-full">
          {PRESETS.map((minutes) => (
            <button key={minutes} className={`btn join-item btn-sm flex-1 ${running && timer.minutes === minutes ? "btn-primary" : "bg-base-100"}`} onClick={() => start(minutes)}>
              {minutes}
            </button>
          ))}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            start(Number(custom));
          }}
        >
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_MINUTES}
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            placeholder="Minuten"
            aria-label="Eigene Dauer in Minuten"
            className="input input-sm min-w-0 flex-1"
          />
          <button className="btn btn-primary btn-sm" disabled={!(Number(custom) > 0)}>
            Start
          </button>
        </form>
      </div>
    </>
  );
}
