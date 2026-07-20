# pglite-app — Monorepo (turbo / vite / pnpm / typescript)

> **You are an AI coding agent.** This repository is a *template*, not a
> finished app. Read this file, then follow the links below before you
> write or change any code.

## What this project actually is

This app has **no real server**. Instead of Node/Express + a real Postgres
database, everything runs **inside the browser**:

- **React (TSX)** — the UI layer (`apps/demo`), only ever talking to the
  "backend" through `api` (`@workspace/browser/client`).
- **PGlite** — a full Postgres build compiled to WASM, running in a Web Worker.
- **Drizzle ORM** — type-safe schema + query builder, talking to that in-browser Postgres.
- **A Web Worker** (`packages/browser/src/worker/worker.ts`) — hosts the database
  and a small repository layer. This worker *is* your "backend". It never
  talks to the network.
- **Comlink** — turns the worker's exposed functions into something the main
  thread can call with plain `await api.userList()`, as if it were a REST API.
- **IndexedDB** (via PGlite's `dataDir: 'idb://...'`) — where the data
  actually lives, so it survives page reloads.

There is no HTTP API, no auth server, no cloud database. Saving data means
writing to this in-browser Postgres via Drizzle; it survives reloads because
it's in IndexedDB, not memory.

## Monorepo layout

```
apps/
  demo/                     the original demo app (UI only)
    src/App.tsx, main.tsx, components/, assets/, style.css

packages/
  browser/                  @workspace/browser — all browser-side "backend" logic
    src/client.ts             Comlink client, ensureDbReady()
    src/worker/                the fake "backend" (Web Worker)
      worker.ts                 Comlink-exposed flat API
      migrate.ts                 runs Drizzle migrations
      repositories/               *.repo.ts, one per table/domain
    src/db/                     Drizzle schema + generated SQL migrations
      schema.ts
      migrations/*.sql, meta/
    src/s3/                     S3-compatible multi-file upload module
      types.ts, config.ts, validation.ts
      presign.ts                 main-thread bridge (calls the worker via RPC)
      s3Client.ts                 main-thread upload logic (single + multipart)
      useS3Upload.ts               React hook — the only thing components call
      workerPresign.ts            worker-only SigV4 presigned-URL signer (secret key lives only here)
      index.ts
    src/google/                 Google sign-in + Drive access-token module
      types.ts, session.ts, googleAuth.ts, useAuth.ts, index.ts
```

`apps/demo` never imports PGlite, Drizzle, the schema's query builder, or
any S3/Google credential logic directly — it only imports from
`@workspace/browser` (`/client`, `/s3`, `/google`). Keep this boundary.

## Where to look for what

| Need to...                                                          | Read                                           |
| --------------------------------------------------------------------| ----------------------------------------------- |
| Understand the layers and which file does what                      | [docs/architecture.md](./docs/architecture.md) |
| Add a new table/feature (the step-by-step recipe)                   | [docs/workflow.md](./docs/workflow.md)         |
| Understand `worker.ts`'s flat API design, `client.ts`, `migrate.ts` | [docs/worker-api.md](./docs/worker-api.md)     |
| Work on Google sign-in / Drive access token                         | [docs/auth-module.md](./docs/auth-module.md)   |
| Work on the S3-compatible multi-file upload                        | [docs/storage-module.md](./docs/storage-module.md) |
| Know what must never be changed (Vite config, migrations, etc.)     | [docs/constraints.md](./docs/constraints.md)   |

> Paths referenced in `docs/*` were written for the pre-monorepo layout
> (`src/auth/*`, `src/storage/*`, `src/worker/*`, `src/db/*`). Under this
> monorepo they now live at `packages/browser/src/google/*`,
> `packages/browser/src/s3/*`, `packages/browser/src/worker/*`, and
> `packages/browser/src/db/*` respectively; `apps/demo/src/App.tsx` and
> `apps/demo/src/components/*` replace the old `src/App.tsx` / `src/components/*`.

## Commands

```bash
cp .env.example .env.local            # (in apps/demo) fill in VITE_LOGIN_URL and VITE_GOOGLE_OAUTH_CLIENT_ID (and VITE_S3_*)
pnpm install                          # install deps (run from repo root)
pnpm dev                              # start Vite dev server (turbo dev)
pnpm build                            # type-check (tsc) + production build
pnpm --filter @workspace/browser db:generate   # generate a new SQL migration after editing packages/browser/src/db/schema.ts
```

`db:generate` runs `drizzle-kit generate` from `packages/browser` — see
[docs/workflow.md](./docs/workflow.md) for when and how to use it.
