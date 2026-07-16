# Architecture

This app has no real server. Everything runs in the browser:

```
┌──────────────────────────────┐        Comlink RPC        ┌────────────────────────────────┐
│  Main thread (UI)             │ ────────────────────────▶ │  Web Worker (fake "backend")     │
│  src/main.tsx, src/App.tsx,   │ ◀──────────────────────── │  src/worker/worker.ts            │
│  src/client.ts                │      (structured clone,   │  - creates the one PGlite instance │
│  (React components/hooks)     │       all async)           │  - runs migrations once           │
└──────────────────────────────┘                            │  - exposes a FLAT api object       │
                                                              │  - delegates to repositories       │
                                                              └────────────────┬──────────────────┘
                                                                               │
                                                                               ▼
                                                              ┌────────────────────────────────┐
                                                              │  src/worker/repositories/*.ts     │
                                                              │  (one file per table/domain)       │
                                                              │  - Drizzle queries only             │
                                                              │  - this is your "service layer"     │
                                                              └────────────────┬──────────────────┘
                                                                               │
                                                                               ▼
                                                              ┌────────────────────────────────┐
                                                              │  PGlite (Postgres in WASM)         │
                                                              │  persisted to IndexedDB            │
                                                              │  schema in src/db/schema.ts         │
                                                              └────────────────────────────────┘
```

**The one rule that matters most:** the main thread never imports PGlite, Drizzle,
or the schema's query builder directly. It only imports `api` from `src/client.ts`
and calls methods on it. Keep this boundary — it's what keeps the WASM/DB code
out of the main bundle and off the main thread.

## File-by-file guide

| Path | What it is | Should the AI edit it? |
|---|---|---|
| `src/db/schema.ts` | Drizzle table definitions + relations + exported types (`User`, `NewUser`, ...). | **Yes** — primary place to add/change tables. |
| `src/db/migrations/*.sql` | Generated SQL migrations. | **No** — never hand-write or hand-edit. Generate with `npm run db:generate`. |
| `src/db/migrations/meta/*` | Drizzle-kit's internal bookkeeping. | **No** — fully auto-generated. |
| `src/worker/worker.ts` | Comlink-exposed "backend" entrypoint. Owns the PGlite instance, delegates to repositories. | **Yes** — add one method per new operation, keep the object flat. See [worker-api.md](./worker-api.md). |
| `src/worker/migrate.ts` | Runs pending migrations on startup with hash checks. | **Rarely** — generic plumbing. |
| `src/worker/repositories/*.repo.ts` | One file per table/domain. All actual Drizzle queries live here. | **Yes** — second primary place to add logic. |
| `src/client.ts` | Creates the Worker, wraps it with `Comlink.wrap<WorkerApi>()`, exposes `ensureDbReady()`. | **Rarely.** |
| `src/main.tsx` | React entry point. Renders `<App />`. | **Rarely** — no DB logic here. |
| `src/App.tsx` | Demo UI. | **Yes** — throwaway, replace/extend freely. Call through `api`, ideally via a small hook (`useUsers()`). |
| `src/style.css`, `src/assets/*` | Demo styling/images. | Freely replace/delete. |
| `src/auth/*` | Google sign-in + Drive access-token module — a second, independent vertical. See [auth-module.md](./auth-module.md). | **Yes** — extend `types.ts`/`session.ts`/`googleAuth.ts`/`useAuth.ts`; call only via `useAuth()`. |
| `src/components/AuthPanel.tsx` | Demo UI for sign-in/out. | **Yes** — replace/extend freely. |
| `src/storage/*` | S3-compatible (S2/R2/AWS) multi-file upload module — a third, independent vertical. See [storage-module.md](./storage-module.md). | **Yes** — extend `types.ts`/`config.ts`/`sigv4.ts`/`s3Client.ts`/`useS3Upload.ts`; call only via `useS3Upload()`. |
| `src/components/S3UploadPanel.tsx` | Demo UI for multi-file upload. | **Yes** — replace/extend freely. |
| `vite.config.ts` | Vite config with two PGlite-required settings. | **Careful** with the PGlite settings, see [constraints.md](./constraints.md). The `react()` plugin is ordinary. |
| `drizzle.config.ts` | Tells `drizzle-kit generate` where the schema/migrations live. DB URL is an unused placeholder. | Leave as-is unless you move `schema.ts` or the migrations folder. |
| `tsconfig.json`, `package.json`, `index.html` | Standard Vite + React scaffolding. | Edit `package.json` normally to add deps. |

## Non-goals

- No real HTTP server, no REST/GraphQL API, no session/auth server (the optional
  `src/auth/` module only redirects to a backend URL to log a login event — see
  [auth-module.md](./auth-module.md)).
- No multi-device sync — data lives in one browser's IndexedDB only, per-origin.
- No server-side rendering (plain client-side React via Vite).
- `src/App.tsx` is a minimal demo, not a design system. Replace it.

If a user asks for "real" backend features (multi-user sync, server-side auth, etc.),
that's a fundamentally different architecture — flag it clearly rather than
silently bolting a real network layer onto the worker.
