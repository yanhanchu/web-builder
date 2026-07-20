// localStorage 存取層：整份 i18n 資料存在單一 key 底下。
//
// 底層邏輯已抽到共用模組 `src/lib/-storage.ts`
// （`createAppKeyedStorage`）：app 設定（app.json）、pages、i18n
// 三個功能都是「以 app 為 key 存一份物件」這個同一種模式，因此共用
// 同一套 load / save 實作，只是各自帶不同的 storageKey。這裡保留原本的
// 函式名稱（loadI18nData / saveI18nData）當作 i18n 專用的薄包裝，避免其他
// 檔案要跟著改 import。

import { createAppKeyedStorage } from '@/store/storage';
import type { I18nData, AppLocales, I18nMetaData, KeyTypeMap } from '@/utils/i18n-utils';

const STORAGE_KEY = 'i18n-manager:data';
const META_STORAGE_KEY = 'i18n-manager:meta';

const i18nStorage = createAppKeyedStorage<AppLocales>(STORAGE_KEY);
const i18nMetaStorage = createAppKeyedStorage<KeyTypeMap>(META_STORAGE_KEY);

export function loadI18nData(): I18nData {
  return i18nStorage.load();
}

export function saveI18nData(data: I18nData): void {
  i18nStorage.save(data);
}

/** 載入每個 app 底下、每個 key 的型別標記（key -> type） */
export function loadI18nMetaData(): I18nMetaData {
  return i18nMetaStorage.load();
}

export function saveI18nMetaData(data: I18nMetaData): void {
  i18nMetaStorage.save(data);
}

/** app 被刪除時，一併清掉 localStorage 裡對應的暫存翻譯資料。 */
export function removeLocalAppI18n(app: string): void {
  i18nStorage.removeApp(app);
  i18nMetaStorage.removeApp(app);
}

/** app 被重新命名時，把 localStorage 裡的翻譯資料 key 一併搬移。 */
export function renameLocalAppI18n(oldName: string, newName: string): void {
  i18nStorage.renameApp(oldName, newName);
  i18nMetaStorage.renameApp(oldName, newName);
}
