import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import journal from '../db/migrations/meta/_journal.json';

const sqlModules = import.meta.glob('../db/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

type MigrationEntry = { idx: number; tag: string; when: number };

function loadMigrationsInOrder(): { tag: string; sql: string }[] {
  const entries = (journal as { entries: MigrationEntry[] }).entries;

  const sorted = [...entries].sort((a, b) => a.idx - b.idx);

  return sorted.map((entry) => {
    const matchKey = Object.keys(sqlModules).find((k) =>
      k.endsWith(`${entry.tag}.sql`)
    );

    if (!matchKey) {
      throw new Error(
        `[migrate] journal.json references migration "${entry.tag}", but no matching .sql file was found`
      );
    }

    return { tag: entry.tag, sql: sqlModules[matchKey] };
  });
}

const MIGRATIONS = loadMigrationsInOrder();

/** Applies pending migrations; hash-checked — see docs/constraints.md */
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
      continue;
    }

    console.log(`[migrate] running migration: ${m.tag}`);

    const statements = m.sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);

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

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
