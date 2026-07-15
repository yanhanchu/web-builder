/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../db/schema';
import { runMigrations } from './migrate';
import { createUsersRepo } from './repositories/users.repo';
import { createPostsRepo } from './repositories/posts.repo';

// AI agents: this file is the entire "backend" of the app. It runs inside a Web
// Worker, owns the one-and-only PGlite (in-browser Postgres) instance, and exposes
// a flat, RPC-style API via Comlink that the main thread calls like an async SDK.
// See README.md for the full architecture explanation and the "golden workflow"
// for adding new tables/features. In short:
//   1. Add/edit tables in ../db/schema.ts, run `npx drizzle-kit generate`.
//   2. Add query methods in a repositories/*.repo.ts file.
//   3. Expose new methods here on the `api` object, following the existing
//      `<entity><Action>` naming (userList, userCreate, ...) — see note below
//      on why this object must stay FLAT rather than nested.

// A single memoized promise ensures DB initialization runs exactly once,
// and every API call awaits it before touching the database.
let dbReady: ReturnType<typeof initDb> | null = null;

async function initDb() {
  // dataDir points at IndexedDB, so data persists across page reloads.
  // For a fresh, non-persistent database (e.g. tests or throwaway demos),
  // just remove `dataDir` entirely — PGlite then runs purely in memory.
  const client = new PGlite({
    dataDir: 'idb://my-app-db',
  });

  await client.waitReady;

  const db = drizzle(client, { schema });

  await runMigrations(db);

  return db;
}

// NOTE for AI agents: the API object below is deliberately FLAT
// (userList / userCreate / ...) rather than nested as { users: { list, create } }.
// This is intentional, not an oversight — do not "clean it up" into nested groups.
// Comlink's type system (RemoteProperty<T>) only recursively converts *functions*
// into awaitable remote functions. A plain nested object gets wrapped as a whole
// rather than recursed into, so Comlink.wrap<WorkerApi>() would not give you a
// working `await api.users.list()` — the types and runtime behavior would diverge.
// If you want a nicer grouped call-site, build a thin wrapper on the main-thread
// side (in client.ts or a UI-layer hook) instead of changing this object's shape.
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

  // --- AI agents: add new domains here, following the pattern above ---
  // 1. `const db = await dbReady!;`
  // 2. delegate to a `createXRepo(db)` from a new repositories/x.repo.ts file
  // Keep method names flat: `<entity><Action>` (e.g. commentList, commentCreate).
};

export type WorkerApi = typeof api;

Comlink.expose(api);
