// 「路由管理」的型別定義。
//
// 這是一個獨立於「頁面預覽（/live）」「i18n 管理」之外的簡單子功能，但同樣
// 是 app 底下的功能：每個 app 可以各自維護一份「path → 目的地」的靜態
// 對照表，跟本專案既有的 pages.json（PageDef 動態渲染系統）完全無關，
// 純粹是路徑管理用途。
//
// 目的地（target）有兩種來源：
//   - 'page'：對應到 build-time 產生的、目前 app 底下的頁面清單
//     （見 data/{app}/pages-map.ts，由 src/pages/generated-pages-map.ts 動態彙整）
//     其中一筆既有頁面。
//   - 'url'：使用者自行輸入的任意網址（可以是站內路徑，也可以是外部連結），
//     不受限於 generatedPages 清單。

/** 單筆自訂路由設定 */
export interface RouteEntry {
  /** 前端產生的唯一識別碼（新增時用 crypto.randomUUID() 產生） */
  id: string;
  /**
   * 使用者自訂的路徑（不含開頭斜線），例如 "about-us"、"landing/promo"。
   */
  path: string;
  /**
   * 目的地類型：
   *   - 'page'：使用 pageId 對應既有的 generatedPages 頁面
   *   - 'url'：使用 targetUrl 自訂任意網址
   */
  targetType: 'page' | 'url';
  /** targetType 為 'page' 時，對應到 data/{app}/pages-map.ts 裡 GeneratedPageEntry 的 id */
  pageId?: string;
  /** targetType 為 'url' 時，使用者自訂的網址（站內路徑或外部連結皆可） */
  targetUrl?: string;
  /** 這筆路由的用途說明，選填，僅供管理時辨識用，不影響實際行為 */
  description?: string;
}

/**
 * data/{app}/routes.json 的資料形狀：app -> 該 app 底下的自訂路由陣列。
 *
 * 跟 pages / i18n 同一套「localStorage 優先，手動同步到檔案系統」模式（見
 * README「App 管理」章節）：編輯即時進 localStorage，只有「寫入檔案系統」
 * 「從檔案系統讀取（覆蓋）」兩個按鈕才會跟 data/{app}/routes.json 互動
 * （見 src/lib/routes-disk-api.ts、scripts/write-routes.mjs）。
 */
export type RoutesData = Record<string /* app */, RouteEntry[]>;

/** 檢查 path 格式是否合法：只允許英數字、連字號、底線、斜線，且不可為空 */
export function isValidRoutePath(path: string): boolean {
  const trimmed = path.trim().replace(/^\/+|\/+$/g, '');
  if (!trimmed) return false;
  return /^[a-zA-Z0-9_\-/]+$/.test(trimmed);
}

/** 正規化 path：去除頭尾斜線與多餘空白 */
export function normalizeRoutePath(path: string): string {
  return path.trim().replace(/^\/+|\/+$/g, '');
}

/** 檢查自訂網址是否為非空字串（不限制格式，站內路徑或外部連結皆可） */
export function isValidTargetUrl(url: string): boolean {
  return typeof url === 'string' && url.trim().length > 0;
}