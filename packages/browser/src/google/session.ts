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
    // localStorage unavailable (e.g. private browsing)
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
