# pglite-app — Frontend-Only "Fake Backend" Starter Template

> **You are an AI coding agent.** This repository is a *template*, not a finished app.
> Read this whole file before you write or change any code.

## What this project actually is

This is a starter template for building apps that have **no real server**. Instead of
a Node/Express/etc. backend + a real Postgres database, everything runs **inside the
user's browser**:

- **React (TSX)** — the UI layer (`src/main.tsx`, `src/App.tsx`), rendered by Vite's
  `@vitejs/plugin-react`. It only ever talks to the "backend" through `api`.
- **PGlite** — a full Postgres build compiled to WASM, running in a Web Worker.
- **Drizzle ORM** — type-safe schema + query builder, talking to that in-browser Postgres.
- **A Web Worker** (`src/worker/worker.ts`) — hosts the database and a small
  repository layer. This worker *is* your "backend". It never talks to the network.
- **Comlink** — turns the worker's exposed functions into something the main thread
  can call with plain `await api.userList()`, as if it were calling a REST API.
- **IndexedDB** (via PGlite's `dataDir: 'idb://...'`) — where the Postgres data
  actually lives, so it survives page reloads. This is the app's only "storage server".

There is no HTTP API, no auth server, no cloud database. When a user says "save this",
you write it to this in-browser Postgres via Drizzle. When they reload the page, the
data is still there because it's in IndexedDB, not memory.

**Your job when extending this app:** add tables to the schema, add repository
methods in the worker, expose them on the worker's flat API object, and call them
from the main thread (or from whatever UI framework the user has you adopt/bring in).
You almost never need anything outside `src/`.

## Architecture at a glance

```
┌─────────────────────────────┐        Comlink RPC        ┌───────────────────────────────┐
│   Main thread (UI)           │ ────────────────────────▶ │  Web Worker (fake "backend")   │
│   src/main.tsx, src/App.tsx, │ ◀──────────────────────── │  src/worker/worker.ts          │
│   src/client.ts              │      (structured clone,   │  - creates PGlite instance      │
│   (React components/hooks)   │       all async)           │  - runs migrations once         │
└─────────────────────────────┘                            │  - exposes a FLAT api object    │
                                                             │  - delegates to repositories    │
                                                             └───────────────┬────────────────┘
                                                                             │
                                                                             ▼
                                                             ┌───────────────────────────────┐
                                                             │  src/worker/repositories/*.ts   │
                                                             │  (one file per table/domain)     │
                                                             │  - Drizzle queries only          │
                                                             │  - this is your "service layer"  │
                                                             └───────────────┬────────────────┘
                                                                             │
                                                                             ▼
                                                             ┌───────────────────────────────┐
                                                             │  PGlite (Postgres in WASM)       │
                                                             │  persisted to IndexedDB          │
                                                             │  schema defined in src/db/schema.ts │
                                                             └───────────────────────────────┘
```

The main thread **never imports PGlite, Drizzle, or the schema's query builder
directly**. It only ever imports `api` from `src/client.ts` and calls methods on it.
This boundary is intentional — keep it.

## File-by-file guide (where to work, what not to touch)

| Path | What it is | Should the AI edit it? |
|---|---|---|
| `src/db/schema.ts` | Drizzle table definitions + relations + exported TS types (`User`, `NewUser`, ...). | **Yes — this is the primary place to add/change tables.** |
| `src/db/migrations/*.sql` | Generated SQL migration files. | **No — never hand-write or hand-edit.** Generate with `npx drizzle-kit generate` after changing `schema.ts`. |
| `src/db/migrations/meta/*` | Drizzle-kit's internal bookkeeping (`_journal.json`, `*_snapshot.json`). | **No — fully auto-generated.** Never edit by hand. |
| `src/worker/worker.ts` | The Comlink-exposed "backend" entrypoint. Owns the single PGlite instance and calls into repositories. | **Yes — add one method per new operation, keep the object flat (see below).** |
| `src/worker/migrate.ts` | Runs pending migrations on startup, using file-hash checks to detect edited migrations. | **Rarely — it's generic.** Only touch if you need to change *how* migrations run, not *what* they contain. |
| `src/worker/repositories/*.repo.ts` | One file per table/domain. All actual Drizzle queries live here. This is your "service/DAL layer". | **Yes — this is the second primary place to add logic.** Add a new file per new table/domain (e.g. `comments.repo.ts`). |
| `src/client.ts` | Creates the Worker, wraps it with `Comlink.wrap<WorkerApi>()`, exposes `ensureDbReady()`. | **Rarely.** Only touch if you need multiple workers, a different worker path, etc. |
| `src/main.tsx` | React entry point. Creates the root and renders `<App />`. | **Rarely.** It should only ever mount `<App />` — don't add DB logic here. |
| `src/App.tsx` | Current demo UI (React function component). | **Yes — replace/extend freely.** This (and any components you add alongside it, e.g. `src/components/`) is throwaway demo code, not part of the architecture. Add more components, routing, state management, whatever the user wants; just keep calling through `api` from `src/client.ts`, ideally from a small hook (e.g. `useUsers()`) rather than scattering `api.*` calls across every component. |
| `src/style.css` | Demo styling. | Freely replace/delete. |
| `src/assets/*` | Demo images (Vite/TS logos, hero image). | Freely replace/delete. |
| `vite.config.ts` | Vite config — has the `react()` plugin plus two settings PGlite *requires* (see below). | **Be careful with the PGlite-related settings.** The `react()` plugin itself is ordinary and safe to reconfigure. |
| `drizzle.config.ts` | Tells `drizzle-kit generate` where the schema is and where to write migration files. The DB URL is a placeholder and is never actually connected to. | Leave as-is unless you move `schema.ts` or the migrations folder. |
| `tsconfig.json`, `package.json`, `index.html` | Standard Vite + React project scaffolding (`tsconfig.json` has `"jsx": "react-jsx"` set; `index.html` loads `src/main.tsx`). | Edit `package.json` normally to add dependencies; the rest rarely needs changes. |

## The golden workflow: adding a new feature/table

When a user asks for a new feature (say, "add comments on posts"), follow this exact
sequence:

1. **Add the table to `src/db/schema.ts`.**
   Define columns, add `relations()` if it references another table, and export
   `type Comment = typeof comments.$inferSelect` / `NewComment = typeof comments.$inferInsert`.

2. **Generate the migration.** Run:
   ```bash
   npx drizzle-kit generate
   ```
   This writes a new `.sql` file into `src/db/migrations/` and updates
   `src/db/migrations/meta/_journal.json` automatically. Do not write this SQL by hand —
   `src/worker/migrate.ts` hashes each migration file's contents and will throw a hard
   error at runtime if a previously-applied migration's content changes. If you need to
   change a table that has already shipped, **add a new migration**, never edit an old one.

3. **Add a repository file** under `src/worker/repositories/` (e.g. `comments.repo.ts`),
   following the existing pattern in `users.repo.ts` / `posts.repo.ts`: a factory function
   `createXRepo(db)` returning an object of async methods that use Drizzle's query API
   (`db.query.x.findMany(...)`, `db.insert(...)`, `db.update(...)`, `db.delete(...)`).

4. **Expose new methods on the worker's `api` object** in `src/worker/worker.ts`.
   Follow the naming convention already used: `<entity><Action>`, e.g. `commentList`,
   `commentCreate`, `commentRemove` — **not** nested like `comments.list()`. See
   "Why the worker API is flat" below for why this matters.

5. **Call the new methods from the UI** via `import { api } from './client'` in a
   React component (e.g. `src/App.tsx`) or a small custom hook (e.g.
   `useComments()` that wraps `api.commentList` / `api.commentCreate` with
   `useState`/`useEffect`). `api.commentCreate({...})` behaves like a normal
   `async` function call — Comlink handles the message-passing to the worker
   transparently. A typical pattern is: call the mutation, then re-fetch (or
   optimistically update) the list `useState` and let React re-render.

You almost never need to touch `client.ts`, `migrate.ts`, `vite.config.ts`, or the
`meta/` files for a normal feature addition.

## Why the worker API is flat (don't "clean this up" into nested objects)

`src/worker/worker.ts` exposes a single flat object:

```ts
const api = {
  async userList() { ... },
  async userCreate(input) { ... },
  async postList() { ... },
  // ...
};
```

This looks unergonomic compared to `{ users: { list, create }, posts: { list } }`, but
it's **deliberate**, not an oversight. Comlink's type system (`RemoteProperty<T>`) only
recursively converts *functions* into remote, awaitable functions. A plain nested object
gets wrapped as a whole (via a `Promise`-returning proxy get), not recursed into — so
`Comlink.wrap<WorkerApi>()` would not give you the ergonomic `await api.users.list()`
call you'd expect; the types and the runtime behavior would diverge. Keep the API
surface flat. If you want a nicer call-site grouping, do that in a thin wrapper on the
main-thread side (e.g. a `usersApi = { list: api.userList, create: api.userCreate }`
object in `client.ts` or a UI-layer hook), not inside the worker.

## Key constraints that must be preserved

- **`vite.config.ts` must keep:**
  - `optimizeDeps.exclude: ['@electric-sql/pglite']` — PGlite bundles WASM and its own
    dynamic worker internally; letting esbuild's dependency pre-bundling touch it breaks
    it. Native ESM handling must be left to the browser.
  - `worker: { format: 'es' }` — the worker uses `import`/`export`, so it must be built
    as an ES module worker, not the legacy classic worker format.
- **Migrations are one-way and hash-checked.** Never hand-edit a file in
  `src/db/migrations/*.sql` or `src/db/migrations/meta/*` after it's been generated.
  If schema needs to change, edit `schema.ts` and re-run `drizzle-kit generate` to
  produce a *new* migration.
- **`src/worker/migrate.ts` auto-discovers migration files** via
  `import.meta.glob('../db/migrations/*.sql', { eager: true })` and orders them using
  `_journal.json`. You never need to manually import a new migration file — generating
  it with drizzle-kit is enough.
- **There is exactly one PGlite instance**, created lazily on the first `api.init()`
  call and memoized in the worker's module scope (`dbReady`). Don't create additional
  `new PGlite(...)` instances elsewhere — route all DB access through this worker.
- **Data persistence is controlled by `dataDir` in `initDb()`** (`src/worker/worker.ts`).
  - `dataDir: 'idb://my-app-db'` (current default) → persists to IndexedDB, survives
    reloads. Rename the string if you want a fresh persisted database (e.g. after an
    incompatible schema change during early development, before you care about real
    migrations).
  - Omit `dataDir` entirely → pure in-memory database, wiped on every reload. Useful
    for tests or ephemeral demos.
- **The main thread must never import `@electric-sql/pglite` or `drizzle-orm` directly.**
  All DB access goes through `src/client.ts`'s `api`. This keeps the WASM/DB code out
  of the main bundle and out of the main thread entirely.
- **Always call `ensureDbReady()` (or `api.init()`) before the first data call.**
  It's idempotent (guarded by a memoized promise) and safe to call from multiple places.

## Common tasks and where they land

| Task | Where |
|---|---|
| Add a new table/column | `src/db/schema.ts`, then `npx drizzle-kit generate` |
| Add a query/mutation for an existing table | the matching `*.repo.ts` file |
| Add a brand-new domain (e.g. "comments", "tags") | new file in `src/worker/repositories/`, new methods in `worker.ts`'s `api` object |
| Change how the UI looks/behaves | `src/App.tsx` and any components you add under `src/` (or restructure as you like) — never touches the DB directly |
| Reset local data during development | change the `dataDir` string in `initDb()`, or clear the browser's IndexedDB for the site |
| Add an npm dependency | `package.json`, as normal |

## Non-goals / things this template deliberately does not have

- No real HTTP server, no REST/GraphQL API, no auth server.
- No multi-device sync — data lives in one browser's IndexedDB only, per-origin.
- No server-side rendering (plain client-side React via Vite).
- The UI in `src/App.tsx` is a minimal React demo, not a design system. Replace it.

If a user asks for "real" backend features (multi-user sync, server-side auth, etc.),
that's a fundamentally different architecture from what this template provides — flag
that clearly rather than silently bolting a real network layer onto the worker.

## Commands

```bash
npm install            # install deps
npm run dev             # start Vite dev server
npm run build            # type-check (tsc) + production build
npm run preview          # preview the production build
npx drizzle-kit generate # generate a new SQL migration after editing schema.ts
```
