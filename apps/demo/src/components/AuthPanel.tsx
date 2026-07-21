import { useState } from 'react';
import { useAuth } from '@workspace/browser/google';
import { Card, CardHeader } from '@workspace/ui/components/demo/card';
import { Button } from '@workspace/ui/components/demo/button';

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
    return (
      <Card>
        <p className="text-sm text-muted-foreground">Checking sign-in state…</p>
      </Card>
    );
  }

  if (!isSignedIn) {
    return (
      <Card>
        <CardHeader title="Sign in" />
        <Button onClick={signIn}>Sign in with Google</Button>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Signed in" />
      <p className="flex items-center gap-2 text-sm text-foreground">
        {user!.picture && (
          <img src={user!.picture} alt="" width={32} height={32} className="rounded-full" />
        )}
        <strong>{user!.name}</strong>
        <span className="text-muted-foreground">({user!.email})</span>
      </p>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" onClick={handleGetDriveToken}>
          Get Drive access token
        </Button>
        <Button variant="ghost" onClick={signOut}>
          Sign out
        </Button>
      </div>
      {driveStatus && <p className="mt-2 text-sm text-muted-foreground">{driveStatus}</p>}
    </Card>
  );
}
