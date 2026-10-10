// Short messages at the bottom of the screen, e.g. "Karte gelöscht" with an undo button.
// A plain store outside React, so code in src/lib can show one as well.
import { useSyncExternalStore } from "react";

export interface Toast {
  id: number;
  text: string;
  /** One button next to the text; the toast closes when it was pressed. */
  action?: { label: string; run: () => void | Promise<void> };
}

/** How long a toast stays: longer when it offers something to do. */
const PLAIN_MS = 4000;
const WITH_ACTION_MS = 8000;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function publish(next: Toast[]) {
  toasts = next;
  listeners.forEach((listener) => listener());
}

export function dismissToast(id: number): void {
  clearTimeout(timers.get(id));
  timers.delete(id);
  publish(toasts.filter((toast) => toast.id !== id));
}

/** Shows a message. Returns its id, in case it should go away earlier. */
export function showToast(text: string, action?: Toast["action"]): number {
  const id = nextId++;
  // One at a time: a new message replaces the old one, which is what people expect of such a strip.
  for (const toast of toasts) dismissToast(toast.id);
  publish([{ id, text, action }]);
  timers.set(id, setTimeout(() => dismissToast(id), action ? WITH_ACTION_MS : PLAIN_MS));
  return id;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const get = () => toasts;
const EMPTY: Toast[] = [];
const getServer = () => EMPTY;

export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, get, getServer);
}
