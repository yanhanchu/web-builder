/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../db/schema';
import { runMigrations } from './migrate';
import { createUsersRepo } from './repositories/users.repo';
import { createPostsRepo } from './repositories/posts.repo';
import { createPresignedPutUrl, type WorkerStorageConfig } from './presign';

/**
 * Worker-only storage config for the presign "backend" simulation. Reads
 * the same underlying secret via Vite env vars because this whole app is
 * still one client-side bundle (see docs/storage-module.md) — but by
 * keeping this read here instead of in `src/storage/config.ts`, the key
 * only ever exists inside worker module scope and is never imported by
 * `src/storage/*` or any component. A real backend would read this from
 * a server-only env instead.
 */
function loadWorkerStorageConfig(): WorkerStorageConfig {
  return {
    kind: (import.meta.env.VITE_S3_KIND ?? 'custom') as WorkerStorageConfig['kind'],
    endpoint: import.meta.env.VITE_S3_ENDPOINT,
    region: import.meta.env.VITE_S3_REGION ?? 'us-east-1',
    bucket: import.meta.env.VITE_S3_BUCKET ?? '',
    accessKeyId: import.meta.env.VITE_S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: import.meta.env.VITE_S3_SECRET_ACCESS_KEY ?? '',
    forcePathStyle: import.meta.env.VITE_S3_FORCE_PATH_STYLE
      ? import.meta.env.VITE_S3_FORCE_PATH_STYLE === 'true'
      : (import.meta.env.VITE_S3_KIND ?? 'custom') !== 'r2',
  };
}

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

  /**
   * Simulated `POST /api/presign` — see docs/storage-module.md.
   * This is the ONLY place the S3 secret key is read/used. The main
   * thread never sees it; it only gets back a time-limited signed URL
   * for this one object key.
   */
  async storagePresignPutUrl(key: string, contentType: string) {
    const config = loadWorkerStorageConfig();
    return createPresignedPutUrl(config, key, contentType);
  },
};

export type WorkerApi = typeof api;

Comlink.expose(api);
