/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../db/schema';
import { runMigrations } from './migrate';
import { createUsersRepo } from './repositories/users.repo';
import { createPostsRepo } from './repositories/posts.repo';

// 用一個 promise 確保「初始化」只做一次,
// 且所有 API 呼叫都會先等它初始化完成才執行。
let dbReady: ReturnType<typeof initDb> | null = null;

async function initDb() {
  // dataDir 指向 IndexedDB,資料會持久化保存,重新整理頁面不會消失。
  // 若想要「每次都乾淨的資料庫」(例如測試環境),把 dataDir 拿掉即可 (變成純記憶體)。
  const client = new PGlite({
    dataDir: 'idb://my-app-db',
  });

  await client.waitReady;

  const db = drizzle(client, { schema });

  await runMigrations(db);

  return db;
}

// 注意:這裡刻意把 API "攤平" 成單層方法 (userList / userCreate ...),
// 而不是巢狀成 { users: { list, create } }。
// 原因是 Comlink 的型別系統 (RemoteProperty<T>) 只有「函式」才會被遞迴地
// 轉成 Remote<T>;一般巢狀物件只會被整包 Promisify,不會遞迴進去把
// 裡面的 method 轉成可呼叫的 async function。攤平可以完全避開這個限制,
// 讓 Comlink.wrap<WorkerApi>() 產生的型別跟實際 runtime 行為一致。
const api = {
  async init() {
    if (!dbReady) {
      dbReady = initDb();
    }
    await dbReady;
    return { ok: true };
  },

  // --- users ---
  async userList() {
    const db = await dbReady!;
    return createUsersRepo(db).list();
  },
  async userGetById(id: number) {
    const db = await dbReady!;
    return createUsersRepo(db).getById(id);
  },
  async userCreate(input: Parameters<ReturnType<typeof createUsersRepo>['create']>[0]) {
    const db = await dbReady!;
    return createUsersRepo(db).create(input);
  },
  async userUpdate(
    id: number,
    input: Parameters<ReturnType<typeof createUsersRepo>['update']>[1]
  ) {
    const db = await dbReady!;
    return createUsersRepo(db).update(id, input);
  },
  async userRemove(id: number) {
    const db = await dbReady!;
    return createUsersRepo(db).remove(id);
  },

  // --- posts ---
  async postList() {
    const db = await dbReady!;
    return createPostsRepo(db).list();
  },
  async postCreate(input: Parameters<ReturnType<typeof createPostsRepo>['create']>[0]) {
    const db = await dbReady!;
    return createPostsRepo(db).create(input);
  },
  async postTogglePublish(id: number) {
    const db = await dbReady!;
    return createPostsRepo(db).togglePublish(id);
  },
  async postRemove(id: number) {
    const db = await dbReady!;
    return createPostsRepo(db).remove(id);
  },
};

export type WorkerApi = typeof api;

Comlink.expose(api);
