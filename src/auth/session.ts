// AI agents: this file is the "data" (persistence) layer for auth.
// It only knows how to read/write an AuthSession to localStorage.
// It has zero knowledge of Google, OAuth, redirects, etc. — that logic
// lives in googleAuth.ts. Keep this split; don't merge the two.

import { EMPTY_SESSION, type AuthSession } from './types';

const STORAGE_KEY = 'auth-session';

export function loadSession(): AuthSession {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_SESSION;
    const parsed = JSON.parse(raw);
    return { ...EMPTY_SESSION, ...parsed };
  } catch {
    return EMPTY_SESSION;
  }
}

export function saveSession(session: AuthSession) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // localStorage unavailable (e.g. private mode) — session just won't persist
    // across reloads; in-memory React state still works for the current tab.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
