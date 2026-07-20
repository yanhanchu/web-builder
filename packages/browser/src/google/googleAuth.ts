import type { GoogleTokenResponse, GoogleUser } from './types';

const GOOGLE_DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
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

export function signIn() {
  if (!loginUrl) {
    throw new Error('VITE_LOGIN_URL is not configured');
  }
  window.location.href = `${loginUrl}?ori=${encodeURIComponent(window.location.href)}`;
}

export interface LoginRedirectResult {
  user: GoogleUser;
  idToken: string;
  driveAccessToken: string | null;
  driveAccessTokenExpiresAt: number | null;
}

/** Reads login redirect query params, decodes the JWT, and cleans the URL. */
export function consumeLoginRedirect(): LoginRedirectResult | null {
  const params = new URLSearchParams(window.location.search);
  const credential = params.get('credential');
  if (!credential) return null;

  let user: GoogleUser | null = null;
  try {
    user = decodeIdToken(credential);
  } catch (error) {
    console.error('Failed to decode Google ID token from login redirect', error);
  }

  const accessToken = params.get('access_token');
  const accessTokenExpiresAtRaw = params.get('access_token_expired_at');

  params.delete('credential');
  params.delete('access_token');
  params.delete('access_token_expired_at');
  const newQuery = params.toString();
  window.history.replaceState({}, '', window.location.pathname + (newQuery ? `?${newQuery}` : ''));

  if (!user) return null;

  const driveAccessTokenExpiresAt = accessTokenExpiresAtRaw
    ? Number.parseInt(accessTokenExpiresAtRaw, 10)
    : null;

  return {
    user,
    idToken: credential,
    driveAccessToken: accessToken,
    driveAccessTokenExpiresAt: Number.isFinite(driveAccessTokenExpiresAt)
      ? driveAccessTokenExpiresAt
      : null,
  };
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

/** Returns a valid Drive token, refreshing via GIS when near expiry. See docs/auth-module.md */
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
