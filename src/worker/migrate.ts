import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import journal from '../db/migrations/meta/_journal.json';

// --- 自動掃描 migrations 資料夾 ---
// import.meta.glob 是 Vite 的功能:在 build time 掃描符合 pattern 的檔案,
// 用 `?raw` 讓每個檔案內容變成字串,`eager: true` 讓它們直接被打包進 bundle
// (不是 lazy code-splitting,因為初始化資料庫本來就需要全部 migration)。
//
// 好處:新增 migration 時只需要跑 `drizzle-kit generate`,
// 不用手動回來這個檔案裡加一行 import。
const sqlModules = import.meta.glob('../db/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

type MigrationEntry = { idx: number; tag: string; when: number };

function loadMigrationsInOrder(): { tag: string; sql: string }[] {
  const entries = (journal as { entries: MigrationEntry[] }).entries;

  // journal.json 的 entries 順序就是正確的執行順序 (idx 遞增),
  // 這裡明確 sort 一次,避免未來 journal 格式或掃描順序有變化時出錯。
  const sorted = [...entries].sort((a, b) => a.idx - b.idx);

  return sorted.map((entry) => {
    // glob 的 key 會是相對路徑,例如 '../db/migrations/0000_worthless_ben_grimm.sql'
    const matchKey = Object.keys(sqlModules).find((k) =>
      k.endsWith(`${entry.tag}.sql`)
    );

    if (!matchKey) {
      // 這種情況代表 journal.json 講的檔案實際上不存在——
      // 通常是有人手動刪了 .sql 檔但沒有清 journal,寧可直接炸掉也不要悄悄跳過。
      throw new Error(
        `[migrate] journal.json 記錄了 migration "${entry.tag}",但找不到對應的 .sql 檔案`
      );
    }

    return { tag: entry.tag, sql: sqlModules[matchKey] };
  });
}

const MIGRATIONS = loadMigrationsInOrder();

/**
 * 執行所有尚未套用的 migration。
 *
 * 安全性設計:
 * 1. 每個 migration 用單一 transaction 包住——裡面任何一句 SQL 失敗,
 *    整個 migration 全部 rollback,不會留下「半套用」的表。
 * 2. 用 SHA-256 hash 記錄每個 migration 實際執行過的內容——
 *    如果本地已標記為「跑過」,但檔案內容跟當初執行時不一樣了
 *    (例如有人事後修改了已發布的 migration 檔),直接拋錯,
 *    而不是悄悄忽略這個不一致。
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
          `[migrate] migration "${m.tag}" 的內容與先前套用時不一致 (hash mismatch)。` +
            ` 已發布的 migration 不應該被修改——請新增一個新的 migration 來調整 schema。`
        );
      }
      continue; // 已套用且內容一致,跳過
    }

    console.log(`[migrate] 執行 migration: ${m.tag}`);

    const statements = m.sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);

    // PGlite 支援 db.transaction(),失敗會自動 rollback,
    // 確保「一個 migration 檔案」在資料庫層面是不可分割的單位。
    await db.transaction(async (tx) => {
      for (const statement of statements) {
        await tx.execute(statement);
      }
      await tx.execute(
        sql`INSERT INTO __drizzle_migrations (tag, hash) VALUES (${m.tag}, ${hash})`
      );
    });
  }

  console.log('[migrate] 所有 migration 完成');
}

// 瀏覽器 / worker 環境都有 Web Crypto API (crypto.subtle),不需要額外套件。
async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
