// ============================================================
// resolve-route —— page（+ locale）-> 輸出路徑
//
// 路由的權威來源是「資料管理 / 路由」分頁建立的 RouteDataSource
// （kind: "route", target: "page", pageId, value, noindex）：
//   - value 是這個頁面實際的 URL path（例如 "/about"）
//   - pageId 指回 PageItem.id
// 這裡不自己發明路徑規則，只是在 sources 裡找出 target==="page" 且
// pageId===page.id 的那一筆，取它的 value。找不到對應 route 時，退回用
// page.id 當路徑（例如 id "home" -> "/home"），並回報一個 warning 讓呼叫端
// 決定要不要中斷，而不是靜默產生一個「使用者沒設定過」的網址。
//
// locale 的路徑前綴規則：
//   - defaultLocale 不加前綴（例如 zh-TW 是預設語系 -> "/about"）
//   - 其餘語系加前綴（例如 en -> "/en/about"）
// 這是最常見的 i18n 路由慣例（next-intl / astro i18n 預設行為皆如此），
// 之後如果要換成「每個語系都要前綴」或「用子網域」，只需要改這個檔案。
// ============================================================

import type { DataSource } from "@workspace/ui/lib/data-model/schema";
import type { PageItem } from "@workspace/ui/lib/page-model";

export interface ResolvedRoute {
  page: PageItem;
  locale: string;
  /** 這個頁面在資料裡設定的路徑（未加 locale 前綴），例如 "/about"。 */
  routePath: string;
  /** 加上 locale 前綴後、實際要輸出的 URL path，例如 "/en/about"。 */
  urlPath: string;
  /** 對應的輸出檔案相對路徑（含 index.html），例如 "en/about/index.html"。 */
  outputFile: string;
  /** 這個 route 是否要求 noindex（來自 RouteDataSource.noindex）。 */
  noindex: boolean;
}

export interface ResolveRouteOptions {
  sources: Record<string, DataSource>;
  defaultLocale: string;
  onWarning?: (message: string) => void;
}

/** 在 sources 裡找出 pageId 對應的 RouteDataSource（target==="page"）。找不到回傳 undefined。 */
function findRouteForPage(sources: Record<string, DataSource>, pageId: string) {
  for (const source of Object.values(sources)) {
    if (source.kind === "route" && source.target === "page" && source.pageId === pageId) {
      return source;
    }
  }
  return undefined;
}

function normalizeRoutePath(value: string): string {
  if (!value.startsWith("/")) return `/${value}`;
  return value;
}

/** 把 URL path 轉成輸出檔案相對路徑（靜態站慣例：每個路徑一個資料夾 + index.html）。 */
function routePathToOutputFile(urlPath: string): string {
  if (urlPath === "/") return "index.html";
  const trimmed = urlPath.replace(/^\/+|\/+$/g, "");
  return `${trimmed}/index.html`;
}

/** 把 locale 前綴接到 route path 上（defaultLocale 不加前綴）。 */
function withLocalePrefix(routePath: string, locale: string, defaultLocale: string): string {
  if (locale === defaultLocale) return routePath;
  return routePath === "/" ? `/${locale}` : `/${locale}${routePath}`;
}

export function resolveRoute(
  page: PageItem,
  locale: string,
  options: ResolveRouteOptions,
): ResolvedRoute {
  const { sources, defaultLocale, onWarning } = options;

  const route = findRouteForPage(sources, page.id);
  let routePath: string;
  let noindex = false;

  if (route) {
    routePath = normalizeRoutePath(route.value);
    noindex = route.noindex;
  } else {
    routePath = normalizeRoutePath(`/${page.id}`);
    onWarning?.(
      `頁面 "${page.name}"（id: ${page.id}）沒有對應的路由設定（route target=page），` +
        `暫用 "${routePath}"，建議到「路由」資料補上一筆。`,
    );
  }

  const urlPath = withLocalePrefix(routePath, locale, defaultLocale);
  const outputFile = routePathToOutputFile(urlPath);

  return { page, locale, routePath, urlPath, outputFile, noindex };
}

/** 展開「所有語系 x 所有頁面」成完整的路由清單。跳過 status !== "published" 的頁面（草稿不產出）。 */
export function resolveAllRoutes(
  pages: PageItem[],
  locales: string[],
  options: ResolveRouteOptions,
): ResolvedRoute[] {
  const routes: ResolvedRoute[] = [];
  for (const page of pages) {
    if (page.status !== "published") continue;
    for (const locale of locales) {
      routes.push(resolveRoute(page, locale, options));
    }
  }
  return routes;
}
