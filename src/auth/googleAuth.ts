// AI agents: this file is the "logic" layer for auth — all the actual
// Google/OAuth mechanics live here. It has no React and no localStorage
// access (that's session.ts) and renders nothing (that's the UI layer,
// e.g. a useAuth hook + components). Keep those three concerns separate.
//
// Flow this implements (see README.md "Auth module" for the full picture):
//   1. signIn() redirects the browser to VITE_LOGIN_URL, a backend page
//      that exists ONLY to record a login event — it is not a session
//      server and the frontend never talks to it again after this redirect.
//   2. That backend redirects back to this app with `credential` (a Google
//      ID token / JWT) in the query string.
//   3. consumeLoginRedirect() reads and decodes that JWT into a GoogleUser,
//      then strips the query params from the URL.
//   4. ensureDriveAccessToken() lazily requests (and silently refreshes) a
//      Google Drive OAuth access token directly from Google Identity
//      Services, entirely in the browser. The backend is never involved in
//      obtaining or refreshing this token.
import type { GoogleTokenResponse, GoogleUser } from './types';

const GOOGLE_DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

// Refresh proactively once fewer than this many ms remain on the token,
// so callers essentially never observe an expired token.
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

const loginUrl = import.meta.env.VITE_LOGIN_URL as string | undefined;
const googleClientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined;

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            hint?: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback: (error: { type: string; message?: string }) => void;
          }): {
            requestAccessToken(opts?: { prompt?: string; hint?: string }): void;
          };
        };
      };
    };
  }
}

/** Redirects to the backend's login page. The backend only logs the login
 * event and bounces the browser back here with `credential` in the query
 * string — it holds no session and is never contacted again afterwards. */
export function signIn() {
  if (!loginUrl) {
    throw new Error('VITE_LOGIN_URL is not configured');
  }
  window.location.href = `${loginUrl}?ori=${encodeURIComponent(window.location.href)}`;
}

/**
 * Reads the query string produced by the backend's login-redirect for a
 * `credential` (Google ID token JWT), decodes it, and cleans the URL.
 * Returns null if there's no credential in the current URL.
 */
export function consumeLoginRedirect(): GoogleUser | null {
  const params = new URLSearchParams(window.location.search);
  const credential = params.get('credential');
  if (!credential) return null;

  let user: GoogleUser | null = null;
  try {
    user = decodeIdToken(credential);
  } catch (error) {
    console.error('Failed to decode Google ID token from login redirect', error);
  }

  // Strip auth params so they don't linger in the URL / browser history.
  params.delete('credential');
  const newQuery = params.toString();
  window.history.replaceState({}, '', window.location.pathname + (newQuery ? `?${newQuery}` : ''));

  return user;
}

function decodeIdToken(idToken: string): GoogleUser | null {
  const payloadSegment = idToken.split('.')[1];
  if (!payloadSegment) return null;
  const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
  const json = decodeURIComponent(
    atob(base64)
      .split('')
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('')
  );
  const decoded = JSON.parse(json);
  return {
    sub: decoded.sub,
    email: decoded.email,
    name: decoded.name,
    picture: decoded.picture,
  };
}

let gisLoadPromise: Promise<void> | null = null;

/** Loads Google Identity Services' script exactly once. */
function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script'));
    document.head.appendChild(script);
  });
  return gisLoadPromise;
}

/**
 * Requests a Drive appdata-scoped access token directly from Google
 * Identity Services (GIS), entirely client-side.
 * `silent: true` attempts to reuse an existing Google session (no consent
 * prompt); if that's not possible the caller should retry with `silent: false`.
 */
async function requestDriveAccessToken(
  clientId: string,
  hint?: string,
  silent = false
): Promise<GoogleTokenResponse> {
  await loadGoogleIdentityServices();
  if (!window.google) throw new Error('Google Identity Services unavailable');

  return new Promise<GoogleTokenResponse>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_DRIVE_APPDATA_SCOPE,
      hint,
      callback: (response) => {
        if (response.error) reject(new Error(response.error));
        else resolve(response);
      },
      error_callback: (error) => reject(new Error(error.message ?? error.type)),
    });
    client.requestAccessToken({ prompt: silent ? '' : 'consent', hint });
  });
}

export interface DriveTokenState {
  driveAccessToken: string | null;
  driveAccessTokenExpiresAt: number | null;
}

/**
 * Returns a valid Drive access token, reusing `current` if it still has
 * enough life left, otherwise requesting a fresh one from Google (silently
 * when we already have a token — i.e. a refresh — and with a consent
 * prompt on first grant). This is the ONLY place Drive tokens are obtained
 * or refreshed; it never talks to the backend.
 */
export async function ensureDriveAccessToken(
  current: DriveTokenState,
  userEmailHint?: string
): Promise<DriveTokenState> {
  if (!googleClientId) {
    throw new Error('VITE_GOOGLE_OAUTH_CLIENT_ID is not configured');
  }

  const now = Date.now();
  if (
    current.driveAccessToken &&
    current.driveAccessTokenExpiresAt &&
    current.driveAccessTokenExpiresAt - now > EXPIRY_SAFETY_MARGIN_MS
  ) {
    return current;
  }

  const silent = !!current.driveAccessToken;
  const response = await requestDriveAccessToken(googleClientId, userEmailHint, silent);

  return {
    driveAccessToken: response.access_token,
    driveAccessTokenExpiresAt: Date.now() + response.expires_in * 1000,
  };
}
