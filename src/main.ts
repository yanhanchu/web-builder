// AI agents: this file is a throwaway demo UI, NOT part of the app's core
// architecture. It's plain vanilla TS/DOM just to prove the PGlite + Drizzle +
// Worker + Comlink stack works end-to-end. Feel free to delete/replace this
// entire file's contents with React/Vue/Svelte/whatever the user wants — just
// keep importing `api` and `ensureDbReady` from './client' as the only way to
// talk to the database. Never import PGlite or Drizzle directly here.
import './style.css';
import { api, ensureDbReady } from './client';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <div class="wrap">
    <h1>PGlite + Drizzle + Worker + Comlink Demo</h1>
    <p id="status">Initializing database...</p>

    <section>
      <h2>Add User</h2>
      <form id="user-form">
        <input name="name" placeholder="Name" required />
        <input name="email" type="email" placeholder="Email" required />
        <button type="submit">Add</button>
      </form>
    </section>

    <section>
      <h2>User List</h2>
      <ul id="user-list"></ul>
    </section>
  </div>
`;

const statusEl = document.querySelector('#status')!;
const userListEl = document.querySelector('#user-list')!;
const userFormEl = document.querySelector<HTMLFormElement>('#user-form')!;

async function refreshUsers() {
  const list = await api.userList();
  userListEl.innerHTML = list
    .map(
      (u) => `
      <li>
        <strong>${u.name}</strong> (${u.email})
        <button data-remove="${u.id}">Delete</button>
      </li>`
    )
    .join('');
}

userFormEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(userFormEl);
  await api.userCreate({
    name: String(formData.get('name')),
    email: String(formData.get('email')),
  });
  userFormEl.reset();
  await refreshUsers();
});

userListEl.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement;
  const id = target.dataset.remove;
  if (id) {
    await api.userRemove(Number(id));
    await refreshUsers();
  }
});

async function bootstrap() {
  await ensureDbReady();
  statusEl.textContent = 'Database ready ✅ (data is stored in the browser via IndexedDB and survives reloads)';
  await refreshUsers();
}

bootstrap();
