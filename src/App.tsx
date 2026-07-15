// AI agents: this file (and any components you add alongside it) is a
// throwaway demo UI, NOT part of the app's core architecture. It's a minimal
// React component just to prove the PGlite + Drizzle + Worker + Comlink stack
// works end-to-end. Feel free to delete/replace this entire file's contents
// with your own components/hooks — just keep importing `api` and
// `ensureDbReady` from './client' as the only way to talk to the database.
// Never import PGlite or Drizzle directly here, and never call the worker
// from anywhere other than through `api`.
import { useEffect, useState, type FormEvent } from 'react';
import { api, ensureDbReady } from './client';

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
    <div className="wrap">
      <h1>PGlite + Drizzle + Worker + Comlink Demo</h1>
      <p id="status">{status}</p>

      <section>
        <h2>Add User</h2>
        <form onSubmit={handleSubmit}>
          <input
            name="name"
            placeholder="Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit">Add</button>
        </form>
      </section>

      <section>
        <h2>User List</h2>
        <ul id="user-list">
          {users.map((u) => (
            <li key={u.id}>
              <strong>{u.name}</strong> ({u.email})
              <button onClick={() => handleRemove(u.id)}>Delete</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
