# Adding a new feature/table

When asked for a new feature (e.g. "add comments on posts"), follow this exact sequence.

## 1. Add the table to `src/db/schema.ts`

Define columns, add `relations()` if it references another table, and export
`type Comment = typeof comments.$inferSelect` / `NewComment = typeof comments.$inferInsert`.

## 2. Generate the migration

```bash
npm run db:generate
```

(This runs `drizzle-kit generate` under the hood — use the npm script, not a
bare `npx drizzle-kit generate`, so it stays consistent with `package.json`.)

This writes a new `.sql` file into `src/db/migrations/` and updates
`src/db/migrations/meta/_journal.json` automatically.

- **Do not write this SQL by hand.** `src/worker/migrate.ts` hashes each migration
  file's contents and throws at runtime if a previously-applied migration's
  content changes.
- If a table has already shipped and needs to change, **add a new migration**,
  never edit an old one.
- No `.env` / database connection is needed to run this — `drizzle.config.ts`
  points at a placeholder URL that is never actually connected to; `generate`
  only diffs `schema.ts` against the last snapshot on disk.

## 3. Add a repository file

Under `src/worker/repositories/` (e.g. `comments.repo.ts`), following the
existing pattern in `users.repo.ts` / `posts.repo.ts`: a factory function
`createXRepo(db)` returning an object of async methods that use Drizzle's
query API (`db.query.x.findMany(...)`, `db.insert(...)`, `db.update(...)`,
`db.delete(...)`).

## 4. Expose new methods on the worker's `api` object

In `src/worker/worker.ts`. Follow the naming convention already used:
`<entity><Action>`, e.g. `commentList`, `commentCreate`, `commentRemove` —
**not** nested like `comments.list()`. See [worker-api.md](./worker-api.md)
for why the object must stay flat.

## 5. Call the new methods from the UI

`import { api } from './client'` in a React component or a small custom hook
(e.g. `useComments()` wrapping `api.commentList` / `api.commentCreate` with
`useState`/`useEffect`). `api.commentCreate({...})` behaves like a normal
`async` function call — Comlink handles message-passing to the worker
transparently. Typical pattern: call the mutation, then re-fetch (or
optimistically update) the list state and let React re-render.

---

You almost never need to touch `client.ts`, `migrate.ts`, `vite.config.ts`, or
the `meta/` files for a normal feature addition.

## Common tasks and where they land

| Task | Where |
|---|---|
| Add a new table/column | `src/db/schema.ts`, then `npm run db:generate` |
| Add a query/mutation for an existing table | the matching `*.repo.ts` file |
| Add a brand-new domain (e.g. "comments", "tags") | new file in `src/worker/repositories/`, new methods in `worker.ts`'s `api` object |
| Change how the UI looks/behaves | `src/App.tsx` and any components under `src/` — never touches the DB directly |
| Reset local data during development | change the `dataDir` string in `initDb()` (`src/worker/worker.ts`), or clear the browser's IndexedDB for the site |
| Add an npm dependency | `package.json`, as normal |
| Add/change what's stored about the signed-in user or Drive token | `src/auth/types.ts` (shape) + `src/auth/session.ts` (persistence) |
| Change how sign-in/token requests work | `src/auth/googleAuth.ts` |
| Use auth state or request a Drive token from a component | `useAuth()` from `src/auth` |
