// ============================================================
// render-routes-astro —— 把「已發佈頁面」規劃成 Astro 動態路由
// `src/pages/[lang]/{page}.astro` 底下「每個 page 要落地到哪個檔案路徑」的
// 清單。
//
// 跟第一版不同：語系不是在產生器階段展開成實際資料夾（不會有
// `pages/en/about.astro`、`pages/zh-TW/about.astro` 這種為每個語系各自
// 落地一份檔案的做法），而是用 Astro 內建的動態路由片段
// `[lang]`——檔案系統層面只出現一個字面上的 `[lang]` 目錄，實際語系清單由
// 該 `.astro` 檔案自己的 `getStaticPaths()`（SSG 腳本）在建置期展開，對應
// 需求「[lang] 不應該替換為真實的語系，要透過 ssg 腳本去生成語系」。
//
// 因此這裡不再依賴 plan-routes.ts 的 planAllRoutes()（那是「把語系展開成
// 多筆路徑」的規劃邏輯，適合 React SPA／每語系各自落地一份檔案的場景）；
// 改成直接對每個已發佈頁面呼叫一次 resolve-route.ts 的 resolveRoute()，
// 取它「跟語系無關」的 routePath（例如 "/about"、"/"）。routePath 本身不
// 受呼叫時傳入哪個 locale 影響（resolve-route.ts 的 routePath 是 route
// 資料本身的 value，不含 locale 前綴），這裡固定傳 defaultLocale 只是為了
// 滿足函式簽章、讓警告訊息語意一致，不影響算出來的 routePath。
//
// 每個頁面只產生一個檔案路徑（不像第一版按 (page, locale) 展開多筆）：
//
//   /[lang]/index.astro          （page.id === "home"，routePath === "/"）
//   /[lang]/about.astro          （routePath === "/about"）
//   /[lang]/product.astro
//
// 沒有路由資料的頁面（resolve-route.ts fallback 出 `/${page.id}` 那種）
// 一樣照 resolve-route.ts 的邏輯處理、只是額外發出 warning，不在這裡另外
// 排除——跟舊版 plan-routes.ts 規則 3「整批跳過」不同，因為這裡改成不透過
// plan-routes.ts，改由呼叫端（generate-astro.ts）自行決定要不要排除。
// ============================================================

import type { DataSource } from "../../../src/lib/data-model/schema";
import type { PageItem } from "../../../src/lib/page-model";
import { resolveRoute } from "../resolve-route.ts";

export interface AstroPageRouteFile {
  page: PageItem;
  /** 這個頁面跟語系無關的 route path（來自 resolve-route.ts），例如 "/about"、"/"。 */
  routePath: string;
  /**
   * 相對於 `src/pages/[lang]/` 的檔案路徑（不含副檔名），例如：
   *   routePath "/" -> "index"
   *   routePath "/about" -> "about"
   * 呼叫端（generate-astro.ts）會拼成 `pages/[lang]/${pagesRelativePath}.astro`。
   */
  pagesRelativePath: string;
}

export interface PlanAstroPageRouteFilesOptions {
  sources: Record<string, DataSource>;
  /** 只是傳給 resolveRoute() 滿足函式簽章；routePath 本身跟語系無關，見檔案開頭說明。 */
  defaultLocale: string;
  onWarning?: (message: string) => void;
}

/** routePath（例如 "/" / "/about"）轉成 `src/pages/[lang]/` 底下的相對路徑（不含副檔名）。 */
function routePathToPagesRelativePath(routePath: string): string {
  if (routePath === "/") return "index";
  return routePath.replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * 規劃「所有已發佈頁面」在 `src/pages/[lang]/` 底下要落地的檔案清單，
 * 一個 page 一筆（語系交給 `getStaticPaths()` 在執行期展開，不在這裡按
 * locale 複製多份）。
 */
export function planAstroPageRouteFiles(
  pages: PageItem[],
  options: PlanAstroPageRouteFilesOptions,
): AstroPageRouteFile[] {
  const result: AstroPageRouteFile[] = [];
  for (const page of pages) {
    if (page.status !== "published") continue;
    const resolved = resolveRoute(page, options.defaultLocale, options);
    result.push({
      page,
      routePath: resolved.routePath,
      pagesRelativePath: routePathToPagesRelativePath(resolved.routePath),
    });
  }
  return result;
}