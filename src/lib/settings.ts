// Preferences kept on the device (localStorage), with a hook that follows changes made in the
// settings page or in another tab. They do not sync: each device may be set up differently.
import { useSyncExternalStore } from "react";
import { NEW_PER_DAY } from "./srs";
import { isTandemVoice, TANDEM_VOICES, type TandemVoice } from "./tandem";

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

const TANDEM_VOICE_KEY = "kiku-tandem-voice";
/** The voice of the device instead of one of the realistic ones. */
export const DEVICE_VOICE = "device";
export type TandemVoiceSetting = TandemVoice | typeof DEVICE_VOICE;

/** The voice the study tandem speaks with. */
export function tandemVoiceSetting(): TandemVoiceSetting {
  const value = read(TANDEM_VOICE_KEY);
  return value === DEVICE_VOICE || isTandemVoice(value) ? value : TANDEM_VOICES[0].id;
}

export function setTandemVoice(value: TandemVoiceSetting): void {
  write(TANDEM_VOICE_KEY, value === TANDEM_VOICES[0].id ? null : value);
}

export function useTandemVoice(): TandemVoiceSetting {
  return useSyncExternalStore(subscribe, tandemVoiceSetting, () => TANDEM_VOICES[0].id);
}

const SIDEBAR_KEY = "kiku-sidebar-collapsed";

/** Whether the sidebar is folded away on wide screens. */
export function sidebarCollapsedSetting(): boolean {
  return read(SIDEBAR_KEY) === "1";
}

export function setSidebarCollapsed(collapsed: boolean): void {
  write(SIDEBAR_KEY, collapsed ? "1" : null);
}

export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(subscribe, sidebarCollapsedSetting, () => false);
}

const OPEN_FOLDERS_KEY = "kiku-open-folders";

/** Ids of the folders unfolded in the sidebar, as stored: a JSON list. */
function openFoldersSetting(): string {
  return read(OPEN_FOLDERS_KEY) ?? "[]";
}

export function parseOpenFolders(stored: string): Set<string> {
  try {
    const value: unknown = JSON.parse(stored);
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

/** Unfolds or folds folders in the sidebar; nothing is written when that changes nothing. */
export function setFoldersOpen(ids: string[], open: boolean): void {
  const current = parseOpenFolders(openFoldersSetting());
  const before = current.size;
  for (const id of ids) {
    if (open) current.add(id);
    else current.delete(id);
  }
  if (current.size !== before) write(OPEN_FOLDERS_KEY, current.size > 0 ? JSON.stringify([...current]) : null);
}

/** The stored list itself, which stays the same string until it changes; parse it with parseOpenFolders. */
export function useOpenFolders(): string {
  return useSyncExternalStore(subscribe, openFoldersSetting, () => "[]");
}
