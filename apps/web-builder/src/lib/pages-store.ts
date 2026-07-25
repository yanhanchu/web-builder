import { defaultSeo, type SeoData } from "@workspace/ui/lib/data-model";
import { usePersistentState } from "../pages/admin/admin-ui";

// ------------------------------------------------------------
// 頁面清單的共用來源
//
// 之前「頁面管理」跟「資料管理」各自對 localStorage key "wb.pages" 用不同的
// fallback 初始值：頁面管理用 INITIAL_PAGES（含 home / about 兩筆預設頁），
// 資料管理則用空陣列。在使用者從未進過頁面管理、localStorage 裡還沒有實際
// 寫入任何值之前，資料管理讀到的就會是空陣列 —— 路由的「選擇頁面」下拉選單
// 因此看起來像「明明有頁面卻選不到」。
//
// 把 key、預設值、型別都集中在這裡，兩個頁面共用同一份，就不會再對不上。
// ------------------------------------------------------------

export const PAGES_STORAGE_KEY = "wb.pages";

export interface PageItem {
  id: string;
  name: string;
  status: "draft" | "published";
  /** 每頁綁定一筆 SeoData 型別資料（value 即 SEO 內容）。 */
  seo: SeoData;
}

export const INITIAL_PAGES: PageItem[] = [
  {
    id: "home",
    name: "首頁",
    status: "published",
    seo: { ...defaultSeo, title: "首頁", description: "網站首頁" },
  },
  {
    id: "about",
    name: "關於我們",
    status: "published",
    seo: { ...defaultSeo, title: "關於我們" },
  },
];

export function makePageId() {
  return "page_" + Math.random().toString(36).slice(2, 8);
}

/** 完整讀寫頁面清單（頁面管理用）。 */
export function usePagesState() {
  return usePersistentState<PageItem[]>(PAGES_STORAGE_KEY, INITIAL_PAGES);
}
