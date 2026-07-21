// i18n 版本歷史的 localStorage 存取層。
//
// 跟 i18n-storage.ts 一樣，底層沿用共用的 `createAppKeyedStorage`
// （以 app 為 key 存一份物件），只是這裡存的 T 是「版本歷史陣列」
// （`I18nVersionHistory`），而不是單一份翻譯資料。
//
// 這裡仍是版本歷史平常編輯時的即時儲存位置（每次新增/還原版本都會立刻寫
// localStorage），但不再是唯一的儲存位置：i18n-manager.tsx / settings.tsx
// 的「寫入檔案系統」「從檔案系統讀取」現在會把版本歷史一併帶上，寫入/讀出
// `data/{app}/i18n/versions.json`（見 scripts/write-i18n.mjs），所以版本
// 歷史也能跟著整個專案走版本控制（git diff 看得到），不會因為清瀏覽器
// 資料、換裝置就遺失。

import { createAppKeyedStorage } from '@/store/storage';
import type { I18nVersionHistory, I18nVersionsData } from '@/utils/i18n-versions';

const STORAGE_KEY = 'i18n-manager:versions';

const versionStorage = createAppKeyedStorage<I18nVersionHistory>(STORAGE_KEY);

export function loadI18nVersions(): I18nVersionsData {
  return versionStorage.load();
}

export function loadI18nVersionHistory(app: string): I18nVersionHistory {
  return versionStorage.loadApp(app) ?? [];
}

export function saveI18nVersionHistory(app: string, history: I18nVersionHistory): void {
  versionStorage.saveApp(app, history);
}

/** app 被刪除時，一併清掉 localStorage 裡對應的版本歷史。 */
export function removeLocalAppI18nVersions(app: string): void {
  versionStorage.removeApp(app);
}

/** app 被重新命名時，把 localStorage 裡的版本歷史 key 一併搬移。 */
export function renameLocalAppI18nVersions(oldName: string, newName: string): void {
  versionStorage.renameApp(oldName, newName);
}
