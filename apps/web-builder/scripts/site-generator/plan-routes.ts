// ============================================================
// plan-routes —— 把 resolve-route.ts 算出的 ResolvedRoute[]，規劃成「實際
// 要產出哪些路徑」的清單（PlannedRoute[]）。
//
// 這裡只做「路由層」的規劃決策，不碰 JSX / React Router / 檔案系統：目前是
// jsx-codegen（render-routes.ts）在用，但同一份規劃結果之後也可以直接餵給
// Astro 產生器（每個 PlannedRoute 對應一個要產出的頁面檔案），所以刻意跟
// React / react-router 完全無關，純粹是資料轉換。
//
// 規則（呼叫端需求）：
//   1. 只有一種語系：不產生語系相關路徑，就單純輸出這一層
//      （例如 "/pagea"、"/pageb"，不會有 "/zh-TW/pagea" 這種前綴）。
//   2. 有多種語系：
//      - 先以 defaultLocale 的路徑產生「第一層」（不加前綴，例如 "/pagea"）。
//      - 再以「所有語系」（含 defaultLocale 自己）產生「第二層」（一律加
//        locale 前綴，例如 "/en/pagea"、"/zh/pagea"，即使 zh 剛好是
//        defaultLocale，也還是會多產生一份帶前綴的版本）。
//      - 這跟 resolve-route.ts 原本「defaultLocale 不加前綴、其餘才加前綴」
//        的省略式規則不同：這裡兩層都要，defaultLocale 那層不省略帶前綴的
//        版本，是刻意的（例如同時要有 "/about" 也要有 "/zh/about"）。
//   3. 如果某個 page 完全沒有路由資料（resolve-route.ts 的 findRouteForPage
//      找不到對應的 RouteDataSource），就不產生這個 page 的「預設路徑」——
//      不要用 `/${page.id}` 這種猜測出來的路徑當退路。resolve-route.ts 本身
//      仍會照它自己的邏輯 fallback 出一個 routePath（並發出 warning），這裡
//      只是在規劃階段把「沒有明確路由設定的 page」整批排除，不管有沒有
//      fallback 路徑都不採用。
//
// 「易於共用」：這個檔案不 import 任何 react-router / JSX codegen 型別，
// 輸出的 PlannedRoute 只含「這一筆要產出什麼路徑、對應哪個 (page, locale)」
// 的純資料，呼叫端（render-routes.ts 或未來的 Astro 產生器）自己決定怎麼
// 把它變成 <Route> 或檔案。
// ============================================================

import type { DataSource } from "../../src/lib/data-model/schema";
import type { PageItem } from "../../src/lib/page-model";
import { resolveRoute, type ResolvedRoute } from "./resolve-route.ts";

export interface PlannedRoute {
  /** 對應的 resolve-route.ts 結果（urlPath / outputFile / noindex 都在這裡）。 */
  resolved: ResolvedRoute;
  /**
   * 這一筆路徑是不是「無 locale 前綴的那一層」：
   *   - 單語系：唯一一層，一定是 true。
   *   - 多語系：只有 defaultLocale 的第一層（不加前綴）是 true，
   *     其餘（含 defaultLocale 自己帶前綴的第二層）都是 false。
   * 呼叫端如果要判斷「哪一筆是首選/預設版本」可以用這個欄位，不用自己重新
   * 比對 locale === defaultLocale。
   */
  isUnprefixed: boolean;
}

export interface PlanRoutesOptions {
  sources: Record<string, DataSource>;
  defaultLocale: string;
  onWarning?: (message: string) => void;
}

/** 在 sources 裡找出 pageId 對應的 RouteDataSource（target==="page"）。找不到回傳 undefined。
 *  跟 resolve-route.ts 內部同名的私有函式邏輯一致，這裡需要「有沒有路由資料」
 *  這個布林判斷本身（resolve-route.ts 沒有 export 這個判斷，只 export 了
 *  「resolve 完、必要時已經 fallback 過」的結果），所以在這裡重新宣告一次，
 *  維持 resolve-route.ts 對外只暴露「resolve 完的結果」這個單純介面。 */
function hasRouteData(sources: Record<string, DataSource>, pageId: string): boolean {
  for (const source of Object.values(sources)) {
    if (source.kind === "route" && source.target === "page" && source.pageId === pageId) {
      return true;
    }
  }
  return false;
}

/**
 * 規劃單一 page 要產出的所有路徑（依上方三條規則）。
 * 沒有路由資料的 page 回傳空陣列（規則 3）。
 */
function planPageRoutes(page: PageItem, locales: string[], options: PlanRoutesOptions): PlannedRoute[] {
  const { sources, defaultLocale, onWarning } = options;

  if (!hasRouteData(sources, page.id)) {
    onWarning?.(`頁面 "${page.name}"（id: ${page.id}）沒有對應的路由設定（route target=page），已略過、不產生預設路徑。`);
    return [];
  }

  // 單語系：只有一層，不加前綴。
  if (locales.length <= 1) {
    const locale = locales[0] ?? defaultLocale;
    return [{ resolved: resolveRoute(page, locale, options), isUnprefixed: true }];
  }

  // 多語系：第一層（defaultLocale、不加前綴）+ 第二層（所有語系、都加前綴）。
  const planned: PlannedRoute[] = [];

  // 第一層：defaultLocale 不加前綴。resolveRoute 對 defaultLocale 本來就不
  // 加前綴，直接用它的結果即可。
  planned.push({ resolved: resolveRoute(page, defaultLocale, options), isUnprefixed: true });

  // 第二層：所有語系都加前綴（含 defaultLocale 自己）。resolveRoute() 對
  // locale === defaultLocale 永遠不加前綴（那是它原本給「單層路由」用的
  // 慣例），所以 defaultLocale 這筆不能直接呼叫 resolveRoute()，改用
  // forcePrefixedRoute() 手動組出帶前綴的版本。
  for (const locale of locales) {
    const resolved =
      locale === defaultLocale ? forcePrefixedRoute(page, locale, options) : resolveRoute(page, locale, options);
    planned.push({ resolved, isUnprefixed: false });
  }

  return planned;
}

/**
 * 無條件在 routePath 前面加上 locale 前綴，繞過 resolveRoute() 內建的
 * 「locale === defaultLocale 就不加前綴」規則——只用在規則 2 的第二層
 * （defaultLocale 也需要一份帶前綴版本的情境）。routePath / noindex 仍然
 * 完全信任 resolveRoute()（同一份 route 資料來源、同一套 fallback／warning
 * 邏輯），這裡只重新組 urlPath / outputFile 兩個衍生欄位，不重新實作
 * 「找路由資料」那一段。
 */
function forcePrefixedRoute(page: PageItem, locale: string, options: PlanRoutesOptions): ResolvedRoute {
  const base = resolveRoute(page, locale, options); // locale === defaultLocale，這裡的 urlPath 還沒加前綴
  const urlPath = base.routePath === "/" ? `/${locale}` : `/${locale}${base.routePath}`;
  const outputFile = urlPath === "/" ? "index.html" : `${urlPath.replace(/^\/+|\/+$/g, "")}/index.html`;
  return { ...base, urlPath, outputFile };
}

/**
 * 規劃「所有已發佈頁面」的完整路由清單（跳過草稿頁、跳過沒有路由資料的頁）。
 * 呼叫端（render-routes.ts 或未來的 Astro 產生器）直接消費這份清單即可，
 * 不用再自己判斷「單語系 vs 多語系」「要不要加前綴」等規則。
 */
export function planAllRoutes(pages: PageItem[], locales: string[], options: PlanRoutesOptions): PlannedRoute[] {
  const planned: PlannedRoute[] = [];
  for (const page of pages) {
    if (page.status !== "published") continue;
    planned.push(...planPageRoutes(page, locales, options));
  }
  return planned;
}