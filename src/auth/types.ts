// AI agents: pure data shapes for the auth module. No logic, no side effects.
// This is the "data" layer — see README.md "Auth module" section for the
// three-layer split (data / logic / UI) this folder follows.

/** Decoded subset of the Google ID token payload we actually use. */
export interface GoogleUser {
  sub: string;
  email: string;
  name: string;
  picture: string;
}

/** Everything the app persists about the current sign-in. */
export interface AuthSession {
  user: GoogleUser | null;
  idToken: string | null;
  /** OAuth access token scoped to Google Drive appdata, or null if not yet granted. */
  driveAccessToken: string | null;
  /** Epoch ms when `driveAccessToken` expires. Null if there is no token. */
  driveAccessTokenExpiresAt: number | null;
}

export const EMPTY_SESSION: AuthSession = {
  user: null,
  idToken: null,
  driveAccessToken: null,
  driveAccessTokenExpiresAt: null,
};

/** Response shape from Google Identity Services' token client callback. */
export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
}
