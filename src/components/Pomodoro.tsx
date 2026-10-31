"use client";

import { useEffect, useId, useRef, useState } from "react";
import { RotateCcw, Square } from "lucide-react";

const PRESETS = [15, 30, 45, 60];
const KEY = "kiku-pomodoro";

/** The end is stored, not the time left, so the timer runs on while the page is closed or another session is open. */
type Stored = { minutes: number; endsAt: number | null };

function stored(): Stored {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "") as Stored;
    if (typeof value.minutes === "number") return { minutes: value.minutes, endsAt: typeof value.endsAt === "number" ? value.endsAt : null };
  } catch {
    // Nothing stored yet, or private browsing.
  }
  return { minutes: 60, endsAt: null };
}

function store(value: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Private browsing: the timer just ends with the page.
  }
}

/** Only called from taps; outside the component, since the React linter takes it for a call during render. */
function endIn(minutes: number) {
  return Date.now() + minutes * 60_000;
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
 * A study timer over the whole session, not per card: the length in the bar, a tap opens the
 * usual lengths and, while it runs, a reset that starts it over.
 */
export function Pomodoro() {
  const [timer, setTimer] = useState<Stored>(stored);
  const [now, setNow] = useState(() => Date.now());
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
    try {
      audio.current ??= new AudioContext();
    } catch {
      // Without Web Audio the end is only shown.
    }
    rang.current = false;
    const endsAt = endIn(minutes);
    setNow(endsAt - minutes * 60_000);
    update({ minutes, endsAt });
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
        className={`btn btn-xs shrink-0 px-1.5 font-bold tabular-nums ${done ? "btn-warning animate-pulse" : running ? "btn-ghost" : "btn-ghost text-base-content/70"}`}
        aria-label={running ? `Lerntimer, noch ${clock(left ?? 0)}` : done ? "Lerntimer abgelaufen" : `Lerntimer, ${timer.minutes} Minuten`}
        title={done ? "Zeit ist um" : "Lerntimer"}
      >
        {running ? clock(left ?? 0) : done ? "0:00" : `${timer.minutes} min`}
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        onToggle={(event) => event.newState === "open" && place()}
        className="fixed inset-auto m-0 rounded-box border border-base-300 bg-base-100 p-1.5 text-base-content shadow-lg"
      >
        <div className="flex items-center gap-1">
          {PRESETS.map((minutes) => (
            <button
              key={minutes}
              className={`btn btn-xs px-2 tabular-nums ${timer.minutes === minutes ? "btn-primary" : "btn-ghost"}`}
              onClick={() => start(minutes)}
              title={`${minutes} Minuten starten`}
            >
              {minutes}
            </button>
          ))}
          {timer.endsAt !== null && (
            <>
              <span className="mx-0.5 h-4 w-px bg-base-300" aria-hidden />
              <button className="btn btn-xs btn-square btn-ghost" onClick={() => start(timer.minutes)} title={`Neu starten mit ${timer.minutes} Minuten`} aria-label="Neu starten">
                <RotateCcw className="size-3.5" />
              </button>
              <button className="btn btn-xs btn-square btn-ghost" onClick={stop} title="Timer beenden" aria-label="Timer beenden">
                <Square className="size-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
