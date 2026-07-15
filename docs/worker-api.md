# Why the worker API is flat

`src/worker/worker.ts` exposes a single flat object:

```ts
const api = {
  async userList() { ... },
  async userCreate(input) { ... },
  async postList() { ... },
  // ...
};
```

This looks unergonomic compared to `{ users: { list, create }, posts: { list } }`,
but it's **deliberate — don't "clean this up" into nested objects.**

Comlink's type system (`RemoteProperty<T>`) only recursively converts
*functions* into remote, awaitable functions. A plain nested object gets
wrapped as a whole (via a `Promise`-returning proxy get), not recursed into —
so `Comlink.wrap<WorkerApi>()` would not give you the ergonomic
`await api.users.list()` call you'd expect; the types and the runtime
behavior would diverge.

**If you want a nicer grouped call-site**, build a thin wrapper on the
main-thread side instead — e.g. in `client.ts` or a UI-layer hook:

```ts
const usersApi = { list: api.userList, create: api.userCreate };
```

Do this in `client.ts` or a hook, not inside the worker.

## `src/client.ts`

The only file that should create the Worker and wrap it with Comlink.

- `ensureDbReady()` memoizes the init call — safe to call from multiple
  places, idempotent.
- Always call `ensureDbReady()` (or `api.init()`) before the first data call.

## `src/worker/migrate.ts`

Generic migration-runner plumbing — rarely needs editing:

- Auto-discovers migration files via `import.meta.glob('../db/migrations/*.sql', { eager: true })`
  and orders them using `_journal.json`. You never manually import a new
  migration file — `npm run db:generate` is enough.
- Each migration runs inside a transaction — a failed statement rolls back
  the whole migration.
- Each migration's content is hashed (SHA-256) and recorded. If a migration
  marked as applied no longer matches its file's hash, it throws immediately
  instead of silently ignoring the mismatch. This is why shipped migrations
  must never be hand-edited (see [constraints.md](./constraints.md)).

Only touch this file if you need to change *how* migrations run, not *what*
they contain.
