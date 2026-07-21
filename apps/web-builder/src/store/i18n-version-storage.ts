// i18n 版本歷史的 localStorage 存取層。
//
// 跟 i18n-storage.ts 一樣，底層沿用共用的 `createAppKeyedStorage`
// （以 app 為 key 存一份物件），只是這裡存的 T 是「版本歷史陣列」
// （`I18nVersionHistory`），而不是單一份翻譯資料。版本本身純粹是
// 瀏覽器端的「儲存點」，不涉及寫入/讀取檔案系統。

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
