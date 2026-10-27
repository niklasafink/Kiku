// Time spent actively using the app, per day, kept on the device (localStorage). Active means the
// tab is visible and there was a tap, key, scroll or pen stroke within the last minute.
import { DAY, startOfDay } from "./srs";

const KEY = "kiku-active-time";
/** How often the time is counted; also the step it grows by. */
const TICK = 15_000;
/** Without any input for this long the app counts as left alone. */
const IDLE = 60_000;
/** Older days are dropped; the calendar shows one year. */
const KEEP = 400 * DAY;

/** Active seconds per day, keyed by the time of the day's midnight. */
export function readActiveTime(): Map<number, number> {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, number>;
    return new Map(Object.entries(stored).map(([day, seconds]) => [Number(day), seconds]));
  } catch {
    return new Map();
  }
}

/** Adds `seconds` to the day of `now` and forgets days older than a year. */
export function addActiveTime(seconds: number, now: number): void {
  const days = readActiveTime();
  const today = startOfDay(now);
  days.set(today, (days.get(today) ?? 0) + seconds);
  const kept = Object.fromEntries([...days].filter(([day]) => day > now - KEEP));
  try {
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // Without storage the time is simply not counted.
  }
}

/** Starts counting; returns the function that stops it. */
export function trackActiveTime(): () => void {
  let lastInput = Date.now();
  const input = () => {
    lastInput = Date.now();
  };
  const events = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"] as const;
  for (const name of events) window.addEventListener(name, input, { capture: true, passive: true });
  const timer = window.setInterval(() => {
    const now = Date.now();
    if (document.visibilityState === "visible" && now - lastInput < IDLE) addActiveTime(TICK / 1000, now);
  }, TICK);
  return () => {
    for (const name of events) window.removeEventListener(name, input, { capture: true });
    window.clearInterval(timer);
  };
}
