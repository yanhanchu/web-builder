# pglite-app — Frontend-Only "Fake Backend" Starter Template

> **You are an AI coding agent.** This repository is a *template*, not a
> finished app. Read this file, then follow the links below before you
> write or change any code.

## What this project actually is

This app has **no real server**. Instead of Node/Express + a real Postgres
database, everything runs **inside the browser**:

- **React (TSX)** — the UI layer, only ever talking to the "backend" through `api`.
- **PGlite** — a full Postgres build compiled to WASM, running in a Web Worker.
- **Drizzle ORM** — type-safe schema + query builder, talking to that in-browser Postgres.
- **A Web Worker** (`src/worker/worker.ts`) — hosts the database and a small
  repository layer. This worker *is* your "backend". It never talks to the network.
- **Comlink** — turns the worker's exposed functions into something the main
  thread can call with plain `await api.userList()`, as if it were a REST API.
- **IndexedDB** (via PGlite's `dataDir: 'idb://...'`) — where the data
  actually lives, so it survives page reloads.

There is no HTTP API, no auth server, no cloud database. Saving data means
writing to this in-browser Postgres via Drizzle; it survives reloads because
it's in IndexedDB, not memory.

**Your job when extending this app:** add tables to the schema, add
repository methods in the worker, expose them on the worker's flat API
object, and call them from the main thread. You almost never need anything
outside `src/`.

## Architecture at a glance

```
Main thread (UI)  ──Comlink RPC──▶  Web Worker (fake "backend")
src/App.tsx,                        src/worker/worker.ts
src/client.ts                       └─▶ src/worker/repositories/*.ts
                                          └─▶ PGlite (Postgres/WASM) + IndexedDB
                                              schema in src/db/schema.ts
```

The main thread **never imports PGlite, Drizzle, or the schema's query
builder directly** — only `api` from `src/client.ts`. This boundary is
intentional; keep it.

Full diagram, file-by-file table, and non-goals → [docs/architecture.md](./docs/architecture.md)

## Where to look for what

| Need to... | Read |
|---|---|
| Understand the layers and which file does what | [docs/architecture.md](./docs/architecture.md) |
| Add a new table/feature (the step-by-step recipe) | [docs/workflow.md](./docs/workflow.md) |
| Understand `worker.ts`'s flat API design, `client.ts`, `migrate.ts` | [docs/worker-api.md](./docs/worker-api.md) |
| Work on Google sign-in / Drive access token | [docs/auth-module.md](./docs/auth-module.md) |
| Know what must never be changed (Vite config, migrations, etc.) | [docs/constraints.md](./docs/constraints.md) |

## Commands

```bash
cp .env.example .env.local   # fill in VITE_LOGIN_URL and VITE_GOOGLE_OAUTH_CLIENT_ID
npm install                  # install deps
npm run dev                  # start Vite dev server
npm run build                # type-check (tsc) + production build
npm run preview              # preview the production build
npm run db:generate          # generate a new SQL migration after editing src/db/schema.ts
```

`db:generate` runs `drizzle-kit generate` — see [docs/workflow.md](./docs/workflow.md)
for when and how to use it.
