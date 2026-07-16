import { useCallback, useEffect, useState } from 'react';
import { clearSession, loadSession, saveSession } from './session';
import { consumeLoginRedirect, ensureDriveAccessToken, signIn } from './googleAuth';
import { EMPTY_SESSION, type AuthSession } from './types';

export interface UseAuthResult {
  user: AuthSession['user'];
  isReady: boolean;
  isSignedIn: boolean;
  signIn: () => void;
  signOut: () => void;
  getDriveAccessToken: () => Promise<string>;
}

export function useAuth(): UseAuthResult {
  const [session, setSession] = useState<AuthSession>(EMPTY_SESSION);
  const [isReady, setIsReady] = useState(false);

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
