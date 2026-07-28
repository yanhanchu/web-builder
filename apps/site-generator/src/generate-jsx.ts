// ============================================================
// generate-jsx —— 主流程（.tsx 輸出版）：載入資料 -> 產生 .tsx（僅預設語系）
// + 每個 locale 各一份 resolved 資料 JSON -> 寫檔
//
// 對照 generate.ts（既有 HTML 輸出流程），差異：
//   - 不需要 renderToStaticMarkup / preloadBlockTreeComponents / buildCss
//     這一整套「真的執行組件、渲染出畫面」的機制——code generator 只需要
//     ComponentDoc（componentId -> importPath/componentName）跟 resolveValue，
//     不需要真的 import/執行任何 .tsx 組件模組本身。
//   - 仍然需要透過 Vite SSR 載入 @workspace/ui 底下的模組（data-model /
//     page-model / component-registry 等），原因跟 generate.ts 一致：
//     package.json exports 指向未編譯的 .ts/.tsx 原始碼。
//   - 依 roadmap.md「先做一份預設語系的即可」：.tsx 只產生一份（用
//     defaultLocale 的 resolved 值 dump 成 JSX），但 JSON 資料每個 locale
//     各自輸出一份（供之後檢視/比對，也對齊 web-builder 匯出攤平資料時
//     「每個 locale 各自完整輸出」的慣例）。
//   - load-static-data.ts / resolve-route.ts 完全不動（跟輸出格式無關）。
// ============================================================

import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import { loadStaticData } from "./load-static-data.ts";
import { resolveAllRoutes, type ResolvedRoute } from "./resolve-route.ts";
import type { RenderPageJsxOptions, RenderedPageJsx } from "./render-page-jsx.ts";
import type { RenderedPageData } from "./render-page-data.ts";
import type { PageItem } from "@workspace/ui/lib/page-model";
import type { DataStore } from "@workspace/ui/lib/data-model/schema";

export interface GenerateJsxOptions {
  /** 攤平資料根目錄（含 sources/、pages.json、locales.json、style-sheets.json）。 */
  dataDir: string;
  /** 產出目錄：`${outDir}/pages/*.tsx`、`${outDir}/data/<locale>/*.json`。 */
  outDir: string;
  /** monorepo 根目錄，預設從 apps/site-generator 往上兩層推。 */
  workspaceRoot?: string;
  log?: (message: string) => void;
}

export interface GenerateJsxResult {
  /** 每個已發佈頁面產出一份 .tsx（僅 defaultLocale）。 */
  pages: { pageId: string; file: string }[];
  /** 每個 (page, locale) 產出一份 resolved 資料 JSON。 */
  dataFiles: { pageId: string; locale: string; file: string }[];
  warnings: string[];
}

function defaultWorkspaceRoot(): string {
  return path.resolve(import.meta.dirname, "../../..");
}

/** 跟 generate.ts 的 createSsrServer 同一套設定，只是獨立成這個檔案自己的
 * 私有函式——code generator 走的是完全不同的產出路徑（不需要 render-page.ts
 * 那條 renderToStaticMarkup 鏈），沒有理由跟 generate.ts 共用同一個 server
 * 實例（兩者本來就不會在同一次 CLI 呼叫中同時執行）。 */
async function createSsrServer(workspaceRoot: string): Promise<ViteDevServer> {
  return createServer({
    root: path.join(workspaceRoot, "apps/site-generator"),
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@workspace/ui": path.join(workspaceRoot, "packages/ui/src"),
      },
    },
    ssr: {
      noExternal: ["@workspace/ui"],
    },
    optimizeDeps: { noDiscovery: true },
    logLevel: "warn",
  });
}

/** 找出每個 page 的「預設語系」路由，作為要產生 .tsx 的那一份（roadmap.md：`.tsx` 頁面先做一份預設語系的即可）。 */
function pickDefaultLocaleRoutes(routes: ResolvedRoute[], defaultLocale: string): ResolvedRoute[] {
  const byPage = new Map<string, ResolvedRoute>();
  for (const route of routes) {
    if (route.locale === defaultLocale && !byPage.has(route.page.id)) {
      byPage.set(route.page.id, route);
    }
  }
  return Array.from(byPage.values());
}

export async function generateJsx(options: GenerateJsxOptions): Promise<GenerateJsxResult> {
  const workspaceRoot = options.workspaceRoot ?? defaultWorkspaceRoot();
  const log = options.log ?? ((msg: string) => console.log(msg));

  log(`讀取攤平資料：${options.dataDir}`);
  const data = await loadStaticData({ dataDir: options.dataDir });
  for (const issue of data.issues) {
    log(`⚠️  [${issue.file}] ${issue.message}`);
  }

  log("啟動 SSR 模組載入器…");
  const server = await createSsrServer(workspaceRoot);

  const warnings: string[] = [];
  const pagesOut: GenerateJsxResult["pages"] = [];
  const dataFilesOut: GenerateJsxResult["dataFiles"] = [];

  try {
    const { InMemoryDataStore, resolveValue } = (await server.ssrLoadModule(
      "@workspace/ui/lib/data-model/schema",
    )) as typeof import("@workspace/ui/lib/data-model/schema");
    const { typeRegistry, SiteInfoDataTypeId } = (await server.ssrLoadModule(
      "@workspace/ui/lib/data-model/sample-data",
    )) as typeof import("@workspace/ui/lib/data-model/sample-data");
    const { defaultSiteInfo } = (await server.ssrLoadModule(
      "@workspace/ui/lib/data-model",
    )) as typeof import("@workspace/ui/lib/data-model");
    const { renderPageJsx } = (await server.ssrLoadModule(
      path.join(workspaceRoot, "apps/site-generator/src/render-page-jsx.ts"),
    )) as { renderPageJsx: (opts: RenderPageJsxOptions) => RenderedPageJsx };
    const { renderPageData } = (await server.ssrLoadModule(
      path.join(workspaceRoot, "apps/site-generator/src/render-page-data.ts"),
    )) as { renderPageData: (page: PageItem, locale: string, store: DataStore) => RenderedPageData };

    const store = new InMemoryDataStore(data.sources, typeRegistry);

    // defaultLocale 判斷邏輯跟 generate.ts 完全一致（同一個權威來源：
    // typedData:siteInfo:main），刻意不抽成共用函式重複這幾行 —— 兩個
    // generate* 進入點本來就是平行、不互相依賴的產出路徑，各自保留一份
    // 短小的判斷邏輯比硬拉一個共用模組更容易讀懂。
    const siteInfoSource = store.getSource("typedData:siteInfo:main");
    let defaultLocale = data.locales[0] ?? "en";
    if (siteInfoSource?.kind === "typedData") {
      const resolved = resolveValue(typeRegistry[SiteInfoDataTypeId], siteInfoSource.value, store, {
        locale: data.locales[0] ?? "en",
      }) as { defaultLocale?: unknown };
      if (typeof resolved.defaultLocale === "string" && resolved.defaultLocale) {
        defaultLocale = resolved.defaultLocale;
      }
    } else {
      defaultLocale = defaultSiteInfo.defaultLocale || defaultLocale;
    }

    const routes = resolveAllRoutes(data.pages, data.locales, {
      sources: data.sources,
      defaultLocale,
      onWarning: (msg) => {
        warnings.push(msg);
        log(`⚠️  ${msg}`);
      },
    });
    log(`共 ${routes.length} 個頁面 x 語系組合（預設語系：${defaultLocale}）`);

    await rm(options.outDir, { recursive: true, force: true });
    const pagesDir = path.join(options.outDir, "pages");
    const dataDir = path.join(options.outDir, "data");
    await mkdir(pagesDir, { recursive: true });
    await mkdir(dataDir, { recursive: true });

    // --- .tsx：每頁只產出一份，用 defaultLocale 的 resolved 值 dump 成 JSX ---
    const defaultLocaleRoutes = pickDefaultLocaleRoutes(routes, defaultLocale);
    for (const route of defaultLocaleRoutes) {
      const result = renderPageJsx({ page: route.page, locale: route.locale, store });
      for (const w of result.warnings) {
        warnings.push(w);
        log(`⚠️  ${w}`);
      }
      const fileName = `${result.componentName}.tsx`;
      const outFile = path.join(pagesDir, fileName);
      await writeFile(outFile, result.code, "utf-8");
      pagesOut.push({ pageId: route.page.id, file: path.relative(options.outDir, outFile) });
      log(`✓ pages/${fileName}（${route.page.id} · ${route.locale}）`);
    }

    // --- 資料 JSON：每個 (page, locale) 各自一份，攤平成 data/<locale>/<pageId>.json ---
    for (const route of routes) {
      const result = renderPageData(route.page, route.locale, store);
      for (const w of result.warnings) {
        warnings.push(w);
        log(`⚠️  ${w}`);
      }
      const localeDir = path.join(dataDir, route.locale);
      await mkdir(localeDir, { recursive: true });
      const outFile = path.join(localeDir, `${route.page.id}.json`);
      await writeFile(outFile, `${JSON.stringify(result, null, 2)}\n`, "utf-8");
      dataFilesOut.push({
        pageId: route.page.id,
        locale: route.locale,
        file: path.relative(options.outDir, outFile),
      });
      log(`✓ data/${route.locale}/${route.page.id}.json`);
    }
  } finally {
    await server.close();
  }

  log(`完成，共產出 ${pagesOut.length} 份 .tsx、${dataFilesOut.length} 份資料 JSON。`);
  return { pages: pagesOut, dataFiles: dataFilesOut, warnings };
}
