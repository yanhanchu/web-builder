import { useEffect, useState, type FormEvent } from 'react';
import { api, ensureDbReady } from '@workspace/browser/client';
import { Card, CardHeader } from '@workspace/ui/components/Card/Card';
import { Button } from '@workspace/ui/components/Button/Button';
import { Input } from '@workspace/ui/components/Input/Input';
import AuthPanel from './components/AuthPanel';
import S3UploadPanel from './components/S3UploadPanel';

type User = Awaited<ReturnType<typeof api.userList>>[number];

export default function App() {
  const [status, setStatus] = useState('Initializing database...');
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  async function refreshUsers() {
    setUsers(await api.userList());
  }

  useEffect(() => {
    (async () => {
      await ensureDbReady();
      setStatus('Database ready ✅ (data is stored in the browser via IndexedDB and survives reloads)');
      await refreshUsers();
    })();
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await api.userCreate({ name, email });
    setName('');
    setEmail('');
    await refreshUsers();
  }

  async function handleRemove(id: number) {
    await api.userRemove(id);
    await refreshUsers();
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">PGlite + Drizzle + Worker + Comlink Demo</h1>
        <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{status}</p>
      </div>

      <AuthPanel />

      <S3UploadPanel />

      <Card>
        <CardHeader title="Add User" />
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            name="name"
            placeholder="Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            name="email"
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit">Add</Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="User List" />
        <ul className="flex flex-col gap-2">
          {users.map((u) => (
            <li
              key={u.id}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
            >
              <span>
                <strong className="text-foreground">{u.name}</strong>{' '}
                <span className="text-muted-foreground">({u.email})</span>
              </span>
              <Button variant="danger" size="sm" onClick={() => handleRemove(u.id)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
