// AI agents: this hook is the ONLY bridge between the auth data layer
// (session.ts), the auth logic layer (googleAuth.ts), and React UI code.
// Components should never import session.ts or googleAuth.ts directly —
// always go through useAuth(). This keeps "UI vs data vs logic" cleanly
// separated per README.md's "Auth module" section.
import { useCallback, useEffect, useState } from 'react';
import { clearSession, loadSession, saveSession } from './session';
import { consumeLoginRedirect, ensureDriveAccessToken, signIn } from './googleAuth';
import { EMPTY_SESSION, type AuthSession } from './types';

export interface UseAuthResult {
  /** Current signed-in user, or null if signed out. */
  user: AuthSession['user'];
  /** True once we've finished checking localStorage + the URL for a login redirect. */
  isReady: boolean;
  /** True if `user` is non-null. */
  isSignedIn: boolean;
  /** Redirects to the backend's login page (see googleAuth.ts). */
  signIn: () => void;
  /** Clears local auth state. Purely client-side — no backend session to revoke. */
  signOut: () => void;
  /**
   * Resolves to a valid Google Drive access token, requesting/refreshing
   * one via Google Identity Services as needed. Throws if the user isn't
   * signed in or the OAuth client ID isn't configured.
   */
  getDriveAccessToken: () => Promise<string>;
}

export function useAuth(): UseAuthResult {
  const [session, setSession] = useState<AuthSession>(EMPTY_SESSION);
  const [isReady, setIsReady] = useState(false);

  // On mount: check whether we just landed here from the backend's login
  // redirect (URL has `credential`); otherwise fall back to whatever was
  // already persisted in localStorage from a previous visit.
  useEffect(() => {
    const userFromRedirect = consumeLoginRedirect();
    if (userFromRedirect) {
      const next: AuthSession = {
        ...EMPTY_SESSION,
        user: userFromRedirect,
      };
      setSession(next);
      saveSession(next);
    } else {
      setSession(loadSession());
    }
    setIsReady(true);
  }, []);

  const handleSignOut = useCallback(() => {
    clearSession();
    setSession(EMPTY_SESSION);
  }, []);

  const getDriveAccessToken = useCallback(async (): Promise<string> => {
    if (!session.user) {
      throw new Error('Cannot request a Drive access token while signed out');
    }
    const tokenState = await ensureDriveAccessToken(
      {
        driveAccessToken: session.driveAccessToken,
        driveAccessTokenExpiresAt: session.driveAccessTokenExpiresAt,
      },
      session.user.email
    );
    const next: AuthSession = { ...session, ...tokenState };
    setSession(next);
    saveSession(next);
    return tokenState.driveAccessToken!;
  }, [session]);

  return {
    user: session.user,
    isReady,
    isSignedIn: !!session.user,
    signIn,
    signOut: handleSignOut,
    getDriveAccessToken,
  };
}
