// Preferences kept on the device (localStorage), with a hook that follows changes made in the
// settings page or in another tab. They do not sync: each device may be set up differently.
import { useSyncExternalStore } from "react";
import { NEW_PER_DAY } from "./srs";

const CHANGE_EVENT = "kiku-setting-change";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private windows may refuse storage; the default then simply applies.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

const NEW_PER_DAY_KEY = "kiku-new-per-day";
export const MAX_NEW_PER_DAY = 500;

/** New cards introduced per day in folders without an exam date. */
export function newPerDaySetting(): number {
  const value = Number(read(NEW_PER_DAY_KEY));
  return Number.isInteger(value) && value >= 1 && value <= MAX_NEW_PER_DAY ? value : NEW_PER_DAY;
}

export function setNewPerDay(value: number): void {
  write(NEW_PER_DAY_KEY, value === NEW_PER_DAY ? null : String(value));
}

export function useNewPerDay(): number {
  return useSyncExternalStore(subscribe, newPerDaySetting, () => NEW_PER_DAY);
}
