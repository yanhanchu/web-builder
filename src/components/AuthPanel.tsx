import { useState } from 'react';
import { useAuth } from '../auth';

export default function AuthPanel() {
  const { user, isReady, isSignedIn, signIn, signOut, getDriveAccessToken } = useAuth();
  const [driveStatus, setDriveStatus] = useState<string | null>(null);

  async function handleGetDriveToken() {
    setDriveStatus('Requesting Drive access token…');
    try {
      const token = await getDriveAccessToken();
      setDriveStatus(`Got Drive access token (${token.slice(0, 12)}…)`);
    } catch (error) {
      setDriveStatus(`Failed: ${(error as Error).message}`);
    }
  }

  if (!isReady) {
    return <p>Checking sign-in state…</p>;
  }

  if (!isSignedIn) {
    return (
      <section>
        <h2>Sign in</h2>
        <button onClick={signIn}>Sign in with Google</button>
      </section>
    );
  }

  return (
    <section>
      <h2>Signed in</h2>
      <p>
        {user!.picture && (
          <img src={user!.picture} alt="" width={32} height={32} style={{ borderRadius: '50%', verticalAlign: 'middle' }} />
        )}{' '}
        <strong>{user!.name}</strong> ({user!.email})
      </p>
      <button onClick={handleGetDriveToken}>Get Drive access token</button>
      <button onClick={signOut}>Sign out</button>
      {driveStatus && <p>{driveStatus}</p>}
    </section>
  );
}
