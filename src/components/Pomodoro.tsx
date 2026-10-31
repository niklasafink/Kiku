"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Play, Square } from "lucide-react";

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
 * A study timer over the whole session, not per card: only the length in the bar. A tap opens a
 * small row under it with the usual lengths and a start button, and while it runs a stop button.
 */
export function Pomodoro() {
  const [timer, setTimer] = useState<Stored>(stored);
  const [now, setNow] = useState(() => Date.now());
  const [choice, setChoice] = useState(timer.minutes);
  const [place, setPlace] = useState<{ top: number; right: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Created on the tap that starts the timer, since browsers only allow sound after one.
  const audio = useRef<AudioContext | null>(null);
  const rang = useRef(false);

  const left = timer.endsAt === null ? null : timer.endsAt - now;
  const running = left !== null && left > 0;
  const done = left !== null && left <= 0;
  const open = place !== null;

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

  // The bar scrolls sideways on tablets and would cut a dropdown off, so the row is drawn over the
  // page (portal) at the button's spot, right-aligned to it. Not a popover: older iPads lack those.
  function measure() {
    const box = button.current?.getBoundingClientRect();
    if (box) setPlace({ top: box.bottom + 4, right: Math.max(8, window.innerWidth - box.right) });
  }

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setPlace(null);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setPlace(null);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

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
    setPlace(null);
  }

  function stop() {
    update({ ...timer, endsAt: null });
    setPlace(null);
  }

  return (
    <>
      <button
        ref={button}
        onClick={() => {
          if (open) return setPlace(null);
          setChoice(timer.minutes);
          measure();
        }}
        className={`btn btn-xs shrink-0 px-1.5 font-bold tabular-nums ${done ? "btn-warning animate-pulse" : open ? "btn-active" : "btn-ghost"} ${running || done ? "" : "text-base-content/70"}`}
        aria-label={running ? `Lerntimer, noch ${clock(left ?? 0)}` : done ? "Lerntimer abgelaufen" : `Lerntimer, ${timer.minutes} Minuten`}
        aria-expanded={open}
        aria-haspopup="true"
        title={done ? "Zeit ist um" : "Lerntimer"}
      >
        {running ? clock(left ?? 0) : done ? "0:00" : `${timer.minutes} min`}
      </button>
      {place &&
        createPortal(
          <div
            ref={panel}
            role="group"
            aria-label="Lerntimer"
            style={{ top: place.top, right: place.right }}
            className="fixed z-50 flex items-center gap-1 rounded-field border border-base-content/15 bg-base-100 p-1 text-base-content shadow-xl"
          >
            {PRESETS.map((minutes) => (
              <button
                key={minutes}
                className={`btn btn-xs px-1.5 font-bold tabular-nums btn-ghost ${choice === minutes ? "bg-base-content/15" : ""}`}
                aria-pressed={choice === minutes}
                onClick={() => setChoice(minutes)}
              >
                {minutes}
              </button>
            ))}
            <button className="btn btn-primary btn-xs px-2 font-bold" onClick={() => start(choice)} title={`${choice} Minuten starten`}>
              <Play className="size-3" /> {running ? "Neu" : "Start"}
            </button>
            {timer.endsAt !== null && (
              <button className="btn btn-xs btn-square btn-ghost" onClick={stop} title="Timer beenden" aria-label="Timer beenden">
                <Square className="size-3" />
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
