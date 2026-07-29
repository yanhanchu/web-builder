// ============================================================
// generate-split-jsx —— 主流程（拆分資料版）：載入資料 -> 產生
// 「頁面 .tsx + 拆開的資料檔案」-> 寫檔
//
// 對照 generate-jsx.ts（props 直接 inline 寫進頁面 .tsx 的版本），差異只在
// 於 render-page-jsx.ts 換成 render-page-split-jsx.ts：純值 props 不再
// inline，而是拆成獨立資料檔案，頁面 .tsx 改用 `{...varName}` spread 引用
// （見 render-page-split-jsx.ts 檔案開頭的範例對照）。
//
// 輸出目錄配置：
//   pages/<ComponentName>.tsx                        頁面本身（只用 defaultLocale）
//   data/<locale>/<pageId>/<group>.ts                 這個 (page, locale) 拆出的資料檔案
//
// 「檔案不一定在同一個，可能 by 區塊或語系分開」：
//   - by 語系：本來就照 locale 分資料夾（data/<locale>/...），每個 locale
//     各自一組完整的資料檔案，互不共用。
//   - by 區塊：同一個 (page, locale) 底下，資料檔案本身可以再依
//     DataFileGroupingStrategy 拆成多份（見 data-file-writer.ts），預設
//     groupAllInOneFile（整頁一份），也可以換成 groupByComponentName
//     （每個組件名稱各自一份，例如 hero.ts / footer.ts）。
//
// 頁面 .tsx 只會 import defaultLocale 那組資料檔案的相對路徑（因為頁面本身
// 就只用 defaultLocale resolve 一次，不支援動態切換 locale）；其餘 locale
// 的資料檔案單純作為靜態產出物存在（給之後檢視/比對，或給 Astro 之類的
// 消費端自行決定怎麼用），不會被任何 .tsx 引用。
//
// load-static-data.ts / resolve-route.ts 完全不動（跟輸出格式無關）。
// ============================================================

import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import { loadStaticData } from "./load-static-data.ts";
import { resolveAllRoutes, type ResolvedRoute } from "./resolve-route.ts";
import type { RenderPageSplitJsxOptions, RenderedPageSplitJsx } from "./render-page-split-jsx.ts";

export interface GenerateSplitJsxOptions {
  /** 攤平資料根目錄（含 sources/、pages.json、locales.json、style-sheets.json）。 */
  dataDir: string;
  /** 產出目錄：`${outDir}/pages/*.tsx`、`${outDir}/data/<locale>/<pageId>/*.ts`。 */
  outDir: string;
  /** monorepo 根目錄，預設從 apps/site-generator 往上兩層推。 */
  workspaceRoot?: string;
  /**
   * 資料檔案怎麼分組，見 data-file-writer.ts。預設整頁一份（groupAllInOneFile）。
   * 這個選項透過字串名稱指定（而不是直接傳函式），因為主流程是透過 Vite SSR
   * 動態載入 render-page-split-jsx.ts，函式參照沒辦法直接跨 SSR 邊界傳遞；
   * 字串在 SSR module 內部對應成實際策略函式。
   */
  dataFileGrouping?: "all-in-one" | "by-component";
  log?: (message: string) => void;
}

export interface GenerateSplitJsxResult {
  /** 每個已發佈頁面產出一份 .tsx（僅 defaultLocale）。 */
  pages: { pageId: string; file: string }[];
  /** 每個 (page, locale) 產出的所有資料檔案。 */
  dataFiles: { pageId: string; locale: string; file: string }[];
  warnings: string[];
}

function defaultWorkspaceRoot(): string {
  return path.resolve(import.meta.dirname, "../../..");
}

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

/** 找出每個 page 的「預設語系」路由（roadmap.md：`.tsx` 頁面只做一份預設語系的即可）。 */
function pickDefaultLocaleRoutes(routes: ResolvedRoute[], defaultLocale: string): ResolvedRoute[] {
  const byPage = new Map<string, ResolvedRoute>();
  for (const route of routes) {
    if (route.locale === defaultLocale && !byPage.has(route.page.id)) {
      byPage.set(route.page.id, route);
    }
  }
  return Array.from(byPage.values());
}

export async function generateSplitJsx(options: GenerateSplitJsxOptions): Promise<GenerateSplitJsxResult> {
  const workspaceRoot = options.workspaceRoot ?? defaultWorkspaceRoot();
  const log = options.log ?? ((msg: string) => console.log(msg));
  const groupingName = options.dataFileGrouping ?? "all-in-one";

  log(`讀取攤平資料：${options.dataDir}`);
  const data = await loadStaticData({ dataDir: options.dataDir });
  for (const issue of data.issues) {
    log(`⚠️  [${issue.file}] ${issue.message}`);
  }

  log("啟動 SSR 模組載入器…");
  const server = await createSsrServer(workspaceRoot);

  const warnings: string[] = [];
  const pagesOut: GenerateSplitJsxResult["pages"] = [];
  const dataFilesOut: GenerateSplitJsxResult["dataFiles"] = [];

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
    const { renderPageSplitJsx } = (await server.ssrLoadModule(
      path.join(workspaceRoot, "apps/site-generator/src/render-page-split-jsx.ts"),
    )) as { renderPageSplitJsx: (opts: RenderPageSplitJsxOptions) => RenderedPageSplitJsx };

    const store = new InMemoryDataStore(data.sources, typeRegistry);

    // defaultLocale 判斷邏輯跟 generate.ts / generate-jsx.ts 完全一致（同一個
    // 權威來源：typedData:siteInfo:main）。三個 generate* 進入點是平行、
    // 不互相依賴的產出路徑，各自保留一份短小的判斷邏輯，不硬拉共用模組。
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
    log(`共 ${routes.length} 個頁面 x 語系組合（預設語系：${defaultLocale}，資料分組策略：${groupingName}）`);

    await rm(options.outDir, { recursive: true, force: true });
    const pagesDir = path.join(options.outDir, "pages");
    const dataRootDir = path.join(options.outDir, "data");
    await mkdir(pagesDir, { recursive: true });
    await mkdir(dataRootDir, { recursive: true });

    // 每個 (page, locale) 各自跑一次 code generator：defaultLocale 那一組
    // 順便寫出頁面 .tsx，其餘 locale 只寫資料檔案（不產生 .tsx，因為頁面
    // 只需要一份、也不支援動態切換 locale）。
    const defaultLocalePageIds = new Set(pickDefaultLocaleRoutes(routes, defaultLocale).map((r) => r.page.id));

    for (const route of routes) {
      const pageDataDir = path.join(dataRootDir, route.locale, route.page.id);
      const result = renderPageSplitJsx({
        page: route.page,
        locale: route.locale,
        store,
        dataFileGrouping: groupingName,
        // 頁面 .tsx 跟資料檔案的相對位置固定是
        // pages/<Component>.tsx  vs  data/<locale>/<pageId>/<group>.ts，
        // 所以從 pages/ 目錄看資料檔案，相對路徑是 "../data/<locale>/<pageId>/<group>"。
        dataImportPath: (fileBaseName) => `../data/${route.locale}/${route.page.id}/${fileBaseName}`,
      });
      for (const w of result.warnings) {
        warnings.push(w);
        log(`⚠️  ${w}`);
      }

      await mkdir(pageDataDir, { recursive: true });
      for (const dataFile of result.dataFiles) {
        const outFile = path.join(pageDataDir, dataFile.fileName);
        await writeFile(outFile, dataFile.code, "utf-8");
        dataFilesOut.push({
          pageId: route.page.id,
          locale: route.locale,
          file: path.relative(options.outDir, outFile),
        });
        log(`✓ data/${route.locale}/${route.page.id}/${dataFile.fileName}`);
      }

      if (defaultLocalePageIds.has(route.page.id) && route.locale === defaultLocale) {
        const fileName = `${result.componentName}.tsx`;
        const outFile = path.join(pagesDir, fileName);
        await writeFile(outFile, result.pageCode, "utf-8");
        pagesOut.push({ pageId: route.page.id, file: path.relative(options.outDir, outFile) });
        log(`✓ pages/${fileName}（${route.page.id} · ${route.locale}）`);
      }
    }
  } finally {
    await server.close();
  }

  log(`完成，共產出 ${pagesOut.length} 份 .tsx、${dataFilesOut.length} 份資料檔案。`);
  return { pages: pagesOut, dataFiles: dataFilesOut, warnings };
}