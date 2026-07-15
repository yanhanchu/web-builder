import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import journal from '../db/migrations/meta/_journal.json';

// AI agents: this file is generic migration-runner plumbing. You should rarely
// need to edit it — it auto-discovers and runs whatever .sql files exist under
// ../db/migrations, in the order recorded by _journal.json. To add a migration,
// edit ../db/schema.ts and run `npx drizzle-kit generate`; you never need to
// touch this file or manually register a new migration.

// --- Auto-scan the migrations folder ---
// import.meta.glob is a Vite feature: it scans for files matching a pattern at
// build time. `?raw` turns each file's contents into a string, and `eager: true`
// bundles them directly (not lazy code-split, since DB init needs every
// migration up front anyway).
//
// Benefit: adding a migration only requires running `drizzle-kit generate` —
// no need to come back here and manually add an import line.
const sqlModules = import.meta.glob('../db/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

type MigrationEntry = { idx: number; tag: string; when: number };

function loadMigrationsInOrder(): { tag: string; sql: string }[] {
  const entries = (journal as { entries: MigrationEntry[] }).entries;

  // journal.json's entries are already in the correct execution order (idx
  // ascending); we sort explicitly anyway as a safety net in case the journal
  // format or scan order ever changes.
  const sorted = [...entries].sort((a, b) => a.idx - b.idx);

  return sorted.map((entry) => {
    // glob keys are relative paths, e.g. '../db/migrations/0000_worthless_ben_grimm.sql'
    const matchKey = Object.keys(sqlModules).find((k) =>
      k.endsWith(`${entry.tag}.sql`)
    );

    if (!matchKey) {
      // This means journal.json references a migration file that doesn't
      // actually exist — usually because someone deleted a .sql file by hand
      // without cleaning up the journal. Fail loudly rather than silently skip it.
      throw new Error(
        `[migrate] journal.json references migration "${entry.tag}", but no matching .sql file was found`
      );
    }

    return { tag: entry.tag, sql: sqlModules[matchKey] };
  });
}

const MIGRATIONS = loadMigrationsInOrder();

/**
 * Runs every migration that hasn't been applied yet.
 *
 * Safety design:
 * 1. Each migration runs inside a single transaction — if any statement in it
 *    fails, the whole migration rolls back, so no table is left half-applied.
 * 2. Each migration's actual executed content is recorded via a SHA-256 hash.
 *    If a migration is already marked as applied locally but its file content
 *    no longer matches what was originally run (e.g. someone edited an
 *    already-shipped migration file), this throws immediately instead of
 *    silently ignoring the mismatch. AI agents: this is why you must never
 *    hand-edit an existing file under db/migrations/*.sql — always generate a
 *    new migration instead (see README.md).
 */
export async function runMigrations(db: PgliteDatabase<any>) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      tag TEXT NOT NULL UNIQUE,
      hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  for (const m of MIGRATIONS) {
    const hash = await sha256(m.sql);

    const applied = await db.execute<{ hash: string }>(
      sql`SELECT hash FROM __drizzle_migrations WHERE tag = ${m.tag}`
    );

    if (applied.rows.length > 0) {
      const previousHash = applied.rows[0].hash;
      if (previousHash !== hash) {
        throw new Error(
          `[migrate] migration "${m.tag}" content does not match what was previously applied (hash mismatch). ` +
            `Already-shipped migrations must never be edited — add a new migration to change the schema instead.`
        );
      }
      continue; // already applied with matching content, skip
    }

    console.log(`[migrate] running migration: ${m.tag}`);

    const statements = m.sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);

    // PGlite supports db.transaction(), which rolls back automatically on
    // failure, making each migration file an atomic unit at the DB level.
    await db.transaction(async (tx) => {
      for (const statement of statements) {
        await tx.execute(statement);
      }
      await tx.execute(
        sql`INSERT INTO __drizzle_migrations (tag, hash) VALUES (${m.tag}, ${hash})`
      );
    });
  }

  console.log('[migrate] all migrations complete');
}

// Both browser and worker environments have the Web Crypto API (crypto.subtle),
// so no extra package is needed for hashing.
async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
