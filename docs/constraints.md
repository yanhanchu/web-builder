# Constraints that must be preserved

These are the things an AI agent should never "clean up" or simplify away,
even though some of them look redundant or unusual at first glance.

## `vite.config.ts`

- `optimizeDeps.exclude: ['@electric-sql/pglite']` — PGlite bundles its own
  WASM binary and an internal dynamic worker. Letting esbuild's dependency
  pre-bundling touch it breaks it at runtime. Native ESM handling must be
  left to the browser.
- `worker: { format: 'es' }` — the worker (`src/worker/worker.ts`) uses
  `import`/`export`, so it must be built as an ES module worker, not the
  legacy classic worker format.

The `react()` plugin itself is ordinary and safe to reconfigure or swap.

## Migrations are one-way and hash-checked

- Never hand-edit a file in `src/db/migrations/*.sql` or
  `src/db/migrations/meta/*` after it's been generated.
- If the schema needs to change, edit `schema.ts` and re-run
  `npm run db:generate` to produce a *new* migration.
- `src/worker/migrate.ts` auto-discovers migration files via
  `import.meta.glob('../db/migrations/*.sql', { eager: true })` and orders
  them using `_journal.json`. You never manually import a new migration file.

## Exactly one PGlite instance

Created lazily on the first `api.init()` call and memoized in the worker's
module scope (`dbReady`). Don't create additional `new PGlite(...)` instances
elsewhere — route all DB access through this worker.

## Data persistence (`dataDir` in `initDb()`, `src/worker/worker.ts`)

- `dataDir: 'idb://my-app-db'` (current default) → persists to IndexedDB,
  survives reloads. Rename the string for a fresh persisted database (e.g.
  after an incompatible schema change during early development, before real
  migrations matter).
- Omit `dataDir` entirely → pure in-memory database, wiped on every reload.
  Useful for tests or ephemeral demos.

## Main thread boundary

The main thread must never import `@electric-sql/pglite` or `drizzle-orm`
directly. All DB access goes through `src/client.ts`'s `api`. This keeps the
WASM/DB code out of the main bundle and off the main thread entirely.

## Always await readiness first

Always call `ensureDbReady()` (or `api.init()`) before the first data call.
It's idempotent (memoized promise) and safe to call from multiple places.
