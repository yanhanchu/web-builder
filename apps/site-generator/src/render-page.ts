// ============================================================
// render-page —— 單一 (page, locale) render 成完整 HTML 字串
//
// 「資料 + 組件 -> 畫面」的核心邏輯完全來自 @workspace/ui/lib/site-renderer
// （renderBlockTreeSync / preloadBlockTreeComponents），這裡不重新實作、
// 只是：
//   1. 用 page.blocks 呼叫 site-renderer，拿到 <body> 內容的 ReactNode
//   2. resolveValue 出這個 locale 的 SeoData / SiteInfoData，組 <head>
//   3. 套用 page.styleSheetIds 對應的樣式表 + 全域 CSS + no-flash 主題腳本
//   4. renderToStaticMarkup 成字串，拼成完整 <!doctype html> 文件
//
// 不做 hydration（不呼叫 hydrateRoot）：輸出是純靜態 HTML，跟 Astro 的
// "zero JS by default" 精神一致。ThemeToggle / Header 的行動選單這類需要
// 互動的組件，各自的最小 client script 由 generate.ts 另外產生、以
// <script type="module"> 掛在對應 DOM 節點旁，不需要整棵樹 hydrate。
// ============================================================

import { renderToStaticMarkup } from "react-dom/server";
import type { DataStore } from "@workspace/ui/lib/data-model/schema";
import { InMemoryDataStore, resolveValue } from "@workspace/ui/lib/data-model/schema";
import { typeRegistry, SeoDataTypeId, SiteInfoDataTypeId } from "@workspace/ui/lib/data-model/sample-data";
import { defaultSeo, defaultSiteInfo, type SeoData, type SiteInfoData } from "@workspace/ui/lib/data-model";
import { preloadBlockTreeComponents, renderBlockListSync } from "@workspace/ui/lib/site-renderer";
import { themeBootstrapScript } from "@workspace/ui/lib/theme";
import type { PageItem } from "@workspace/ui/lib/page-model";
import type { ResolvedRoute } from "./resolve-route";
import type { StyleSheet } from "./load-static-data";

export interface RenderPageOptions {
  route: ResolvedRoute;
  store: DataStore;
  styleSheets: StyleSheet[];
  /** 全站基本資訊 typedData source id，預設沿用 sample-data.ts 的慣例 "typedData:siteInfo:main"。 */
  siteInfoSourceId?: string;
  /** 全站 SEO 預設 typedData source id，預設沿用 "typedData:seo:default"。 */
  siteDefaultSeoSourceId?: string;
  /**
   * 建置期算好的 CSS 檔案 URL（Tailwind 掃過所有頁面組件後產出的單一
   * stylesheet），例如 "/assets/site.css"。由 generate.ts 的 build-css 步驟
   * 提供，這裡只負責把它接成 <link>，不在這裡做任何 CSS 處理。
   */
  cssHref?: string;
  /** 這個頁面用到的 island（互動組件）client script URL 列表，接成 <script type="module" defer>。 */
  islandScriptHrefs?: string[];
}

export interface RenderedPage {
  html: string;
  /** 這次渲染時遇到但沒有讓整頁失敗的問題（找不到組件、載入失敗等），來自 renderBlockTreeSync 的 fallback。 */
  warnings: string[];
}

/**
 * 依 SeoData + SiteInfoData 組出 <head> 內的 SEO / OpenGraph / Twitter meta。
 * title 套用 titleTemplate（"%s" 替換成頁面標題），跟 SeoData 型別定義的語意一致。
 */
function renderHeadMeta(seo: SeoData, siteInfo: SiteInfoData, route: ResolvedRoute): string {
  const title = seo.titleTemplate.includes("%s")
    ? seo.titleTemplate.replace("%s", seo.title)
    : seo.title || siteInfo.siteName;

  const canonical = seo.canonicalUrl || `${siteInfo.siteUrl}${route.urlPath}`;
  const robots = route.noindex
    ? [seo.robots, "noindex", "nofollow"].filter(Boolean).join(", ")
    : seo.robots;

  const tags: string[] = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(seo.description)}" />`,
    seo.keywords && `<meta name="keywords" content="${escapeHtml(seo.keywords)}" />`,
    `<meta name="robots" content="${escapeHtml(robots)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(seo.description)}" />`,
    `<meta property="og:type" content="${escapeHtml(seo.ogType)}" />`,
    seo.ogImage && `<meta property="og:image" content="${escapeHtml(seo.ogImage)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    seo.twitterCard && `<meta name="twitter:card" content="${escapeHtml(seo.twitterCard)}" />`,
    seo.twitterSite && `<meta name="twitter:site" content="${escapeHtml(seo.twitterSite)}" />`,
    `<meta name="theme-color" content="${escapeHtml(siteInfo.themeColor)}" />`,
    siteInfo.faviconUrl && `<link rel="icon" href="${escapeHtml(siteInfo.faviconUrl)}" />`,
    siteInfo.manifestUrl && `<link rel="manifest" href="${escapeHtml(siteInfo.manifestUrl)}" />`,
  ].filter((v): v is string => Boolean(v));

  return tags.join("\n    ");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 把 page.styleSheetIds 對應的樣式表內容組成 <style> 標籤（依清單順序，維持使用者在頁面屬性面板排的優先序）。 */
function renderInlineStyleSheets(page: PageItem, allSheets: StyleSheet[]): string {
  const ids = page.styleSheetIds ?? [];
  const byId = new Map(allSheets.map((s) => [s.id, s]));
  return ids
    .map((id) => byId.get(id))
    .filter((s): s is StyleSheet => Boolean(s))
    .map((s) => `<style data-stylesheet-id="${escapeHtml(s.id)}">\n${s.css}\n</style>`)
    .join("\n    ");
}

/**
 * Render 一個 (page, locale) 成完整 HTML 文件字串。
 *
 * 呼叫前不需要自己 preload 組件模組：這個函式內部會呼叫
 * preloadBlockTreeComponents，跟 site-renderer 的既有使用方式一致。
 */
export async function renderPage(options: RenderPageOptions): Promise<RenderedPage> {
  const { route, store, styleSheets, cssHref, islandScriptHrefs = [] } = options;
  const { page, locale } = route;

  const siteInfoSourceId = options.siteInfoSourceId ?? "typedData:siteInfo:main";
  const siteDefaultSeoSourceId = options.siteDefaultSeoSourceId ?? "typedData:seo:default";

  const siteInfoType = typeRegistry[SiteInfoDataTypeId];
  const seoType = typeRegistry[SeoDataTypeId];

  const siteInfoSource = store.getSource(siteInfoSourceId);
  const siteInfo: SiteInfoData = siteInfoSource
    ? (resolveValue(siteInfoType, siteInfoSource.kind === "typedData" ? siteInfoSource.value : { mode: "literal", value: null }, store, { locale }) as SiteInfoData)
    : defaultSiteInfo;

  // 頁面自己的 SeoData 是 page.seo（純值，不是 ValueNode，因為它是 PageItem 的一部分，
  // 由頁面管理直接編輯），不需要 resolveValue；只有全站預設（App 設定）才是綁定的 typedData。
  const defaultSeoSource = store.getSource(siteDefaultSeoSourceId);
  const siteDefaultSeo: SeoData = defaultSeoSource
    ? (resolveValue(seoType, defaultSeoSource.kind === "typedData" ? defaultSeoSource.value : { mode: "literal", value: null }, store, { locale }) as SeoData)
    : defaultSeo;

  const seo: SeoData = { ...siteDefaultSeo, ...page.seo };

  await preloadBlockTreeComponents(page.blocks);

  const warnings: string[] = [];
  const bodyNode = renderBlockListSync(page.blocks, {
    locale,
    store,
    renderFallback: ({ block, reason }) => {
      const message =
        reason.kind === "component-not-found"
          ? `找不到組件定義（componentId: ${block.componentId}）`
          : reason.kind === "load-error"
            ? `${block.componentName} 載入失敗：${reason.message}`
            : `${block.componentName} 渲染失敗：${reason.message}`;
      warnings.push(`[${page.id}/${locale}] ${message}`);
      return null;
    },
  });

  const bodyHtml = renderToStaticMarkup(bodyNode as Parameters<typeof renderToStaticMarkup>[0]);

  const headMeta = renderHeadMeta(seo, siteInfo, route);
  const inlineStyles = renderInlineStyleSheets(page, styleSheets);
  const cssLink = cssHref ? `<link rel="stylesheet" href="${escapeHtml(cssHref)}" />` : "";
  const islandScripts = islandScriptHrefs
    .map((href) => `<script type="module" defer src="${escapeHtml(href)}"></script>`)
    .join("\n    ");

  const html = `<!doctype html>
<html lang="${escapeHtml(locale)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${headMeta}
    ${cssLink}
    ${inlineStyles}
    <script>${themeBootstrapScript}</script>
    ${islandScripts}
  </head>
  <body>
    <div id="root">${bodyHtml}</div>
  </body>
</html>
`;

  return { html, warnings };
}
