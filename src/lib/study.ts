import type { Attempt } from "./types";

/** Cards below this score on their last attempt (or never practised) count as "weak". */
export const WEAK_BELOW = 80;

export function isWeak(last: Attempt | undefined): boolean {
  return !last || last.score < WEAK_BELOW;
}

export function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
