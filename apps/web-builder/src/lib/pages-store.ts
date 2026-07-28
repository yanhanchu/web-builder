import { usePersistentState } from "../pages/admin/admin-ui";
import { INITIAL_PAGES, PAGES_STORAGE_KEY, normalizePage, type PageItem } from "@workspace/ui/lib/page-model";

// ------------------------------------------------------------
// 頁面清單的共用來源（app 端：localStorage 讀寫）
//
// 頁面資料的形狀（PageItem / PageBlock）與操作它們的純函式已經搬到
// packages/ui/src/lib/page-model —— 那裡不依賴 React、不依賴 localStorage，
// 讓 site-renderer（畫布即時渲染／之後的靜態產生器／Astro）可以直接
// import 使用，不需要牽動這個 app 專屬的 persistent-state 邏輯。
//
// 這個檔案現在只保留「跟 localStorage / React state 有關」的部分：
// usePagesState 這個 hook，以及維持既有 import 路徑相容的 re-export。
//
// 背景（沿用自舊版註解）：
// 之前「頁面管理」跟「資料管理」各自對 localStorage key "wb.pages" 用不同的
// fallback 初始值：頁面管理用 INITIAL_PAGES（含 home / about 兩筆預設頁），
// 資料管理則用空陣列。在使用者從未進過頁面管理、localStorage 裡還沒有實際
// 寫入任何值之前，資料管理讀到的就會是空陣列 —— 路由的「選擇頁面」下拉選單
// 因此看起來像「明明有頁面卻選不到」。
// 把 key、預設值、型別都集中在 page-model，兩個頁面共用同一份，就不會再對不上。
// ------------------------------------------------------------

// re-export：維持既有 import 路徑（"@/lib/pages-store"）相容，呼叫端不需要
// 全部改成從 @workspace/ui/lib/page-model 匯入。之後若要漸進遷移，新程式碼
// 可以直接改成從 @workspace/ui/lib/page-model 匯入，這裡的 re-export 保留
// 給既有程式碼過渡期使用。
export * from "@workspace/ui/lib/page-model";

/** 完整讀寫頁面清單（頁面管理用）。讀入時自動補齊缺少的 blocks 欄位。 */
export function usePagesState() {
  const [pages, setPages] = usePersistentState<PageItem[]>(PAGES_STORAGE_KEY, INITIAL_PAGES);
  const normalized = pages.map(normalizePage);
  return [normalized, setPages] as const;
}
