import './style.css';
import { api, ensureDbReady } from './client';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <div class="wrap">
    <h1>PGlite + Drizzle + Worker + Comlink Demo</h1>
    <p id="status">初始化資料庫中...</p>

    <section>
      <h2>新增使用者</h2>
      <form id="user-form">
        <input name="name" placeholder="姓名" required />
        <input name="email" type="email" placeholder="Email" required />
        <button type="submit">新增</button>
      </form>
    </section>

    <section>
      <h2>使用者列表</h2>
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
        <button data-remove="${u.id}">刪除</button>
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
  statusEl.textContent = '資料庫已就緒 ✅ (資料存在瀏覽器 IndexedDB,重新整理不會消失)';
  await refreshUsers();
}

bootstrap();
