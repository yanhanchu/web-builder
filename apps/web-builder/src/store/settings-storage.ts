// localStorage 存取層：App 設定（data/{app}/app.json）目前的編輯狀態。
//
// 比照 `src/pages/i18n/storage.ts`、`src/pages/dynamic/storage.ts` 的模式 ——
// 三者都是「以 app 為 key 存一份物件」，底層共用
// `src/lib/-storage.ts` 的 `createAppKeyedStorage`，
// 只是各自帶不同的 storageKey：
//
//   - app-settings:data  ← 本檔案（AppSettings，即 app.json）
//   - pages-editor:data        ← dynamic/storage.ts（PageDef[]，即 pages.json）
//   - i18n-manager:data        ← i18n/storage.ts（AppLocales，即 i18n/{locale}.json）
//
// 資料流（跟 pages / i18n 完全一致）：
//   - 進入 /admin 系列頁面時：優先讀 localStorage；只有該 app 在
//     localStorage 完全沒有紀錄時，才 fallback 到 build 時用 import.meta.glob
//     靜態讀進來的磁碟內容（app-data.ts 的 appsData）。
//   - 編輯過程：每次改動（例如編輯 site name / site url / description）即時
//     整份寫回 localStorage，不需要使用者按任何按鈕，也不會因為重新整理
//     分頁而遺失。
//   - 「寫入檔案系統」：把 localStorage 目前的內容 POST 到
//     /__api/write-apps，真正落地成 data/{app}/app.json。
//   - 「從檔案系統讀取（覆蓋）」：反向 GET /__api/write-apps，把磁碟上
//     的內容整批覆蓋 localStorage 中目前 app 的資料。
//
// 新增 / 刪除 / 重新命名 app 這三個「目錄層級」的操作，語意上不只是
// 編輯欄位，而是要立即反映在整個 app 清單（連帶影響 pages / i18n 能
// 選到哪些 app），因此維持直接呼叫 /__api/write-apps 落地到磁碟，
// 同時也同步更新這裡的 localStorage 快取（新增/搬移/刪除對應的 key），確保
// 三個功能（app 本身、pages、i18n）在 localStorage 裡的 app 集合
// 彼此一致。

import { createAppKeyedStorage } from '@/store/storage';
import type { AppsData, AppSettings } from '@/types/types';

const STORAGE_KEY = 'app-settings:data';

const appSettingsStorage = createAppKeyedStorage<AppSettings>(STORAGE_KEY);

export function loadAppsData(): AppsData {
  return appSettingsStorage.load();
}

/**
 * 訂閱 localStorage 中 app 設定的變動（同分頁內即時通知，見
 * `src/lib/-storage.ts` 的說明）。供 `app-context.tsx` 的
 * `AppProvider` 使用，讓「新增 / 刪除 / 重新命名 app」「編輯設定」
 * 這些動作能立即反映在最外層導覽列的 app 切換 dropdown。
 */
export function subscribeAppsData(fn: (data: AppsData) => void): () => void {
  return appSettingsStorage.subscribe(fn);
}

export function saveAppsData(data: AppsData): void {
  appSettingsStorage.save(data);
}

/** 更新單一 app 的設定，其餘 app 維持不變。 */
export function saveAppSettings(app: string, settings: AppSettings): void {
  appSettingsStorage.saveApp(app, settings);
}

/** app 被刪除時，一併清掉 localStorage 裡對應的暫存設定。 */
export function removeAppSettings(app: string): void {
  appSettingsStorage.removeApp(app);
}

/** app 被重新命名時，把 localStorage 裡的 key 一併搬移。 */
export function renameAppSettings(oldName: string, newName: string): void {
  appSettingsStorage.renameApp(oldName, newName);
}

/**
 * 取得「目前應該拿來初始化畫面」的某個 app 設定：
 * localStorage 裡若已經有這個 app 的紀錄優先採用；否則 fallback 到
 * 磁碟初始值（build 時 import.meta.glob 讀進來的 diskSettings）。
 */
export function resolveInitialAppSettings(
  app: string,
  diskSettings: AppSettings
): AppSettings {
  return appSettingsStorage.resolveInitialForApp(app, diskSettings);
}
