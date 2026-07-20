/**
 * 產生（同步）供前端靜態 import 使用的兩份「聚合檔案」：
 *   - data/pages.json       ← 彙整所有 data/{app}/pages.json
 *   - data/apps.json  ← 彙整所有 data/{app}/app.json
 *
 * 背景：real 資料現在以 app 目錄為單位分開存放
 * （data/{app}/app.json、data/{app}/pages.json、
 * data/{app}/i18n/{locale}.json），但前端有兩處用 Vite 的靜態 `import`
 * 直接讀整份聚合資料（`src/hooks/app/app-context.tsx` 讀 data/apps.json、
 * `src/pages/dynamic-page.tsx（@/lib/app-data）` 等讀 data/pages.json，靠 import.meta.hot
 * 做 HMR），這兩個聚合檔案就是餵給那些靜態 import 用的「衍生產物」。
 *
 * 這份檔案本身不是資料的來源（source of truth）——每個 app 目錄底下的
 * app.json / pages.json 才是——聚合檔案永遠可以重新由這些來源產生，因此
 * write-apps.mjs / write-pages.mjs 每次寫檔後都會呼叫這裡的
 * `syncAggregates()`，讓兩份聚合檔案跟目錄內容保持一致。
 */
import { readJsonFile, writeJsonFile, appSettingsFile, appPagesFile, listAppDirs, ROOT } from './app-fs.mjs';
import path from 'node:path';

const PAGES_AGGREGATE_FILE = path.join(ROOT, 'data', 'pages.json');
const APPS_AGGREGATE_FILE = path.join(ROOT, 'data', 'apps.json');

/** 重新掃描所有 app 目錄，重寫兩份聚合檔案（data/pages.json、data/apps.json） */
export function syncAggregates() {
  const apps = listAppDirs();

  const pagesAggregate = {};
  const appsAggregate = {};

  for (const app of apps) {
    pagesAggregate[app] = readJsonFile(appPagesFile(app), []);
    const appSettings = readJsonFile(appSettingsFile(app), null);
    if (appSettings) {
      appsAggregate[app] = appSettings;
    }
  }

  writeJsonFile(PAGES_AGGREGATE_FILE, pagesAggregate);
  writeJsonFile(APPS_AGGREGATE_FILE, appsAggregate);

  return { pagesAggregate, appsAggregate };
}

// 支援直接以 `node scripts/sync-aggregates.mjs` 執行（例如 predev / prebuild 時）
if (import.meta.url === `file://${process.argv[1]}`) {
  const { pagesAggregate, appsAggregate } = syncAggregates();
  console.log(
    `[sync-aggregates] 已更新 data/pages.json（${Object.keys(pagesAggregate).length} 個 app）與 ` +
      `data/apps.json（${Object.keys(appsAggregate).length} 個 app）`
  );
}
