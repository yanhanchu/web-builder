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

/** 一個被放進頁面內容區的組件實例（組合用）。 */
export interface PageBlock {
  /** 亂數產生的實例 id，用於排序 / 刪除。 */
  instanceId: string;
  /** 對應 components.json 的 ComponentDoc.id，例如 `src/components/demo/button.tsx#Button`。 */
  componentId: string;
  /** 顯示用的組件名稱（快取一份，方便清單顯示）。 */
  componentName: string;
  /** 此實例的 props 覆寫（只存有設定的欄位，未設定的沿用組件預設值）。 */
  props: Record<string, unknown>;
}

export interface PageItem {
  id: string;
  name: string;
  status: "draft" | "published";
  /** 每頁綁定一筆 SeoData 型別資料（value 即 SEO 內容）。 */
  seo: SeoData;
  /** 頁面內容區的組件組合（由「現有組件」區塊拖入或新增）。預設為空陣列。 */
  blocks: PageBlock[];
}

export const INITIAL_PAGES: PageItem[] = [
  {
    id: "home",
    name: "首頁",
    status: "published",
    seo: { ...defaultSeo, title: "首頁", description: "網站首頁" },
    blocks: [],
  },
  {
    id: "about",
    name: "關於我們",
    status: "published",
    seo: { ...defaultSeo, title: "關於我們" },
    blocks: [],
  },
];

export function makePageId() {
  return "page_" + Math.random().toString(36).slice(2, 8);
}

export function makeBlockId() {
  return "blk_" + Math.random().toString(36).slice(2, 10);
}

/** 舊資料可能沒有 blocks 欄位，補上空陣列避免後續流程出錯。 */
export function normalizePage(p: Partial<PageItem>): PageItem {
  return {
    id: p.id ?? makePageId(),
    name: p.name ?? "新頁面",
    status: p.status === "published" ? "published" : "draft",
    seo: p.seo ? { ...defaultSeo, ...p.seo } : { ...defaultSeo },
    blocks: Array.isArray(p.blocks) ? p.blocks : [],
  };
}

/** 完整讀寫頁面清單（頁面管理用）。讀入時自動補齊缺少的 blocks 欄位。 */
export function usePagesState() {
  const [pages, setPages] = usePersistentState<PageItem[]>(PAGES_STORAGE_KEY, INITIAL_PAGES);
  const normalized = pages.map(normalizePage);
  return [normalized, setPages] as const;
}
