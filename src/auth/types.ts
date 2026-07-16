export interface GoogleUser {
  sub: string;
  email: string;
  name: string;
  picture: string;
}

export interface AuthSession {
  user: GoogleUser | null;
  idToken: string | null;
  driveAccessToken: string | null;
  driveAccessTokenExpiresAt: number | null;
}

export const EMPTY_SESSION: AuthSession = {
  user: null,
  idToken: null,
  driveAccessToken: null,
  driveAccessTokenExpiresAt: null,
};

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
}
