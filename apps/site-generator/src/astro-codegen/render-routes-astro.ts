// ============================================================
// render-routes-astro —— 把 plan-routes.ts 算出的 PlannedRoute[]，轉成
// Astro file-based route 底下「每一筆要落地到哪個檔案路徑」的清單。
//
// Astro 只有 file route（沒有像 react-router 那樣的執行期 <Route> 清單），
// 所以這裡的產出不是一段程式碼字串，而是一份「檔案路徑清單」，供
// generate-astro.ts 決定每個 (page, locale) 的 .astro / data.ts 要寫到哪裡。
//
// 對照 plan-routes.ts 開頭的規則（單語系不加前綴；多語系則 defaultLocale
// 不帶前綴的第一層 + 所有語系都帶前綴的第二層），這裡把每一筆 PlannedRoute
// 轉成符合需求的檔案佈局：
//
//   /page1.astro                 （單語系；或多語系 defaultLocale 不帶前綴那層）
//   /page2.astro
//   /[locale]/page1.astro        （多語系，所有語系都帶前綴那層，locale 用實際目錄名稱展開）
//   /[locale]/page2.astro
//
// 這裡故意不真的產生 Astro 的動態路由語法 `[locale]/xxx.astro`（那是給
// getStaticPaths() 執行期展開用的寫法）：因為每個語系的資料已經在產生器
// 階段各自 resolve 成不同的純值（data.ts 內容不同），沒有「同一份頁面 +
// 執行期依 locale 切換字典」這件事——所以帶前綴那層其實是「把 locale
// 名稱直接展開成實際資料夾」（例如 en/page1.astro、zh-TW/page1.astro），
// 不是 Astro 的 `[locale]` 動態片段語法。檔案佈局說明裡用 `[locale]` 只是
// 描述「這裡會是語系名稱」的示意寫法，實際輸出目錄是具體的語系字串。
//
// resolve-route.ts 算出的 ResolvedRoute.urlPath（例如 "/en/about"）已經是
// 「最終 URL」，Astro file route 的檔案路徑等同 URL 路徑（不帶 index.html
// 那層——這是 Astro 慣例：`src/pages/about.astro` 對應 `/about`，
// `src/pages/en/about.astro` 對應 `/en/about`），所以這裡直接把
// ResolvedRoute.urlPath 轉成 `.astro` 檔案的相對路徑即可，不重新發明
// 路徑規則。
// ============================================================

import type { PlannedRoute } from "../plan-routes";

export interface AstroRouteFile {
  planned: PlannedRoute;
  /**
   * 相對於 Astro `src/pages/` 的檔案路徑（不含副檔名），例如：
   *   "/" 這種首頁 -> "index"
   *   "/about" -> "about"
   *   "/en/about" -> "en/about"
   * 呼叫端（generate-astro.ts）會在這個路徑後面接上 `.astro`，並在同一個
   * 資料夾放一份 `data.ts`（見 render-page-astro.ts）。
   */
  pagesRelativePath: string;
}

/** urlPath（例如 "/" / "/about" / "/en/about"）轉成 Astro `src/pages/` 底下的相對路徑（不含副檔名）。 */
function urlPathToPagesRelativePath(urlPath: string): string {
  if (urlPath === "/") return "index";
  return urlPath.replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * 把 planAllRoutes() 算出的完整清單，轉成「每一筆要落地到哪個 .astro 檔案
 * 路徑」的清單。不做去重／排序以外的邏輯轉換——PlannedRoute 本身（單語系
 * 不加前綴；多語系 defaultLocale 不帶前綴的第一層 + 所有語系都帶前綴的
 * 第二層）已經完全對應這裡要的檔案佈局，這裡只是加上 pagesRelativePath
 * 這個衍生欄位。
 */
export function planAstroRouteFiles(plannedRoutes: PlannedRoute[]): AstroRouteFile[] {
  return plannedRoutes.map((planned) => ({
    planned,
    pagesRelativePath: urlPathToPagesRelativePath(planned.resolved.urlPath),
  }));
}
