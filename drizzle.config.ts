import { defineConfig } from 'drizzle-kit';

// AI agents: this config is only used to run `npx drizzle-kit generate`,
// which diffs src/db/schema.ts against the previous snapshot and writes a new
// .sql file under src/db/migrations/. It never actually connects to a database —
// PGlite lives entirely in the browser, so the URL below is a required-but-unused
// placeholder. Do not point this at a real Postgres instance.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: 'postgres://placeholder:placeholder@localhost:5432/placeholder',
  },
});
