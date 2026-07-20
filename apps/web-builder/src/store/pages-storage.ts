// localStorage 存取層：頁面編輯器（/live/edit 系列）目前的編輯狀態。
//
// 底層邏輯已抽到共用模組 `src/lib/-storage.ts`
// （`createAppKeyedStorage`）：app 設定（app.json）、pages、i18n
// 三個功能都是「以 app 為 key 存一份物件」這個同一種模式，因此共用
// 同一套 load / save / resolveInitialForApp 實作，只是各自帶不同的
// storageKey。這裡保留原本的函式名稱（loadLocalPagesData / saveLocalPagesData /
// resolveInitialAppPages）當作 pages 專用的薄包裝，避免其他檔案要跟著
// 改 import。
//
// 資料流：
//   - 進入編輯器時：優先讀 localStorage；若該 app 在 localStorage 裡沒有資料
//     （例如第一次使用、或剛清過瀏覽器資料），才 fallback 到 build 時用
//     import.meta.glob 靜態讀進來的磁碟內容（app-data.ts 的 pagesData）。
//   - 編輯過程中：每次改動都即時寫回 localStorage（見 page-editor.tsx 的
//     useEffect(() => saveLocalPagesData(...), [pages])），不需要使用者手動存檔，
//     也不會因為誤重整分頁而遺失剛剛的編輯。
//   - 「寫入檔案系統」：把 localStorage 目前的內容 POST 到 /__api/write-pages，
//     真正落地成 data/{app}/pages.json。
//   - 「從檔案系統讀取（覆蓋）」：反向 GET /__api/write-pages，把磁碟上的內容
//     整批覆蓋 localStorage 中目前 app 的資料（跟 i18n 的語意一致）。
//
// 只有「寫入 / 讀取檔案系統」這兩個明確動作才會跟檔案系統互動；其餘所有編輯
// 動作都只碰 localStorage。

import { createAppKeyedStorage } from '@/store/storage';
import type { PagesData, PageDef } from '@/types/pages-types';

const STORAGE_KEY = 'pages-editor:data';

const pagesStorage = createAppKeyedStorage<PageDef[]>(STORAGE_KEY);

export function loadLocalPagesData(): PagesData {
  return pagesStorage.load();
}

export function saveLocalPagesData(data: PagesData): void {
  pagesStorage.save(data);
}

/** app 被刪除時，一併清掉 localStorage 裡對應的暫存頁面資料。 */
export function removeLocalAppPages(app: string): void {
  pagesStorage.removeApp(app);
}

/** app 被重新命名時，把 localStorage 裡的頁面資料 key 一併搬移。 */
export function renameLocalAppPages(oldName: string, newName: string): void {
  pagesStorage.renameApp(oldName, newName);
}

/**
 * 取得「目前應該拿來初始化編輯器」的某個 app 頁面陣列：
 * localStorage 裡若已經有這個 app 的資料（即使是空陣列 `[]`，
 * 也視為「使用者曾經在這裡編輯過」）優先採用；否則 fallback 到磁碟初始值
 * （build 時 import.meta.glob 讀進來的 diskPages）。
 */
export function resolveInitialAppPages(
  app: string,
  diskPages: PageDef[] | undefined
): PageDef[] {
  return pagesStorage.resolveInitialForApp(app, diskPages ?? []);
}
