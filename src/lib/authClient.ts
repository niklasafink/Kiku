"use client";

import { createAuthClient } from "@neondatabase/auth/next";

export const authClient = createAuthClient();

export interface AuthFailure {
  status?: number;
  code?: string;
  message?: string;
}

/**
 * The auth client reports a refused request either as a returned `error` or by throwing.
 * Normalises both; null means the server could not be reached at all.
 */
export function authFailure(failure: unknown): AuthFailure | null {
  if (failure instanceof TypeError) return null;
  const { status, code, message } = (failure ?? {}) as AuthFailure;
  return { status, code, message };
}

/** Runs an auth call and hands back its failure instead of throwing; undefined if it went through. */
export async function authAttempt(call: () => Promise<{ error?: unknown }>): Promise<AuthFailure | null | undefined> {
  try {
    const result = await call();
    return result.error ? authFailure(result.error) : undefined;
  } catch (failure) {
    return authFailure(failure);
  }
}
