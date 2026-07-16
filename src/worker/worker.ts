/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../db/schema';
import { runMigrations } from './migrate';
import { createUsersRepo } from './repositories/users.repo';
import { createPostsRepo } from './repositories/posts.repo';

let dbReady: ReturnType<typeof initDb> | null = null;

async function initDb() {
  const client = new PGlite({
    dataDir: 'idb://my-app-db',
  });

  await client.waitReady;

  const db = drizzle(client, { schema });

  await runMigrations(db);

  return db;
}

// Flat `<entity><Action>` methods only — Comlink won't recurse into nested objects. See docs/worker-api.md
const api = {
  async init() {
    if (!dbReady) {
      dbReady = initDb();
    }
    await dbReady;
    return { ok: true };
  },

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
