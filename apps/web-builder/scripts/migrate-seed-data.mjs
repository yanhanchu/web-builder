/**
 * 一次性遷移/初始化腳本：把舊配置（data/apps.json + data/pages.json +
 * data/i18n/{app}/）轉換成新的「一個 app 一個資料夾」配置
 * （data/{app}/app.json + pages.json + i18n/{locale}.json），
 * 並清掉舊的散落檔案/目錄。
 *
 * data/ 底下全部內容都是腳本可重新產生的衍生資料，這裡直接覆寫、不保留舊格式。
 * 執行一次即可：`node scripts/migrate-seed-data.mjs`
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DATA_ROOT, ensureAppDir, appSettingsFile, appPagesFile, appI18nFile, writeJsonFile, readJsonFile } from './app-fs.mjs';
import { syncAggregates } from './sync-aggregates.mjs';

const OLD_APPS_FILE = path.join(DATA_ROOT, 'apps.json');
const OLD_PAGES_FILE = path.join(DATA_ROOT, 'pages.json');
const OLD_I18N_DIR = path.join(DATA_ROOT, 'i18n');

function migrate() {
  const oldApps = readJsonFile(OLD_APPS_FILE, {});
  const oldPages = readJsonFile(OLD_PAGES_FILE, {});

  const allAppNames = new Set([
    ...Object.keys(oldApps),
    ...Object.keys(oldPages),
  ]);

  // 舊版 i18n 目錄結構：data/i18n/{app}/{locale}.json
  if (fs.existsSync(OLD_I18N_DIR)) {
    for (const entry of fs.readdirSync(OLD_I18N_DIR, { withFileTypes: true })) {
      if (entry.isDirectory()) allAppNames.add(entry.name);
    }
  }

  if (allAppNames.size === 0) {
    // 沒有任何舊資料，建立一個空的 default app 讓專案可以直接開始使用
    allAppNames.add('default');
  }

  for (const app of allAppNames) {
    ensureAppDir(app);

    const settings = oldApps[app] ?? { siteName: app, siteUrl: '', description: '' };
    writeJsonFile(appSettingsFile(app), settings);

    const pages = oldPages[app] ?? [];
    writeJsonFile(appPagesFile(app), pages);

    const oldNsI18nDir = path.join(OLD_I18N_DIR, app);
    if (fs.existsSync(oldNsI18nDir)) {
      for (const file of fs.readdirSync(oldNsI18nDir)) {
        if (!file.toLowerCase().endsWith('.json')) continue;
        const locale = file.slice(0, -'.json'.length);
        const content = readJsonFile(path.join(oldNsI18nDir, file), {});
        writeJsonFile(appI18nFile(app, locale), content);
      }
    }
  }

  // 清掉舊的散落檔案/目錄
  if (fs.existsSync(OLD_APPS_FILE)) fs.rmSync(OLD_APPS_FILE, { force: true });
  if (fs.existsSync(OLD_I18N_DIR)) fs.rmSync(OLD_I18N_DIR, { recursive: true, force: true });
  // OLD_PAGES_FILE 會被 syncAggregates() 重新產生成新格式的聚合檔案，不用先刪

  syncAggregates();

  console.log(`[migrate-seed-data] 已將 ${allAppNames.size} 個 app 遷移到 data/{app}/ 配置：`, [...allAppNames]);
}

migrate();
