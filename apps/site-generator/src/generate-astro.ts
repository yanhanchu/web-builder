// ============================================================
// generate-astro —— 主流程（Astro 版）：載入資料 -> 產生「每個 (page,
// locale) 一份 .astro 檔案 + 同目錄 data.ts」-> 寫檔。
//
// 對照 generate-split-jsx.ts（React SPA 版），差異只在於：
//   - Astro 只有 file-based route，沒有 react-router 那種「一份元件 + 多筆
//     <Route> 各自傳 data prop」的做法（見 render-page-astro.ts 開頭「做法
//     B」說明）——每個 (page, locale) 都各自落地一份完整的 .astro 檔案，
//     不像 React 版那樣「pages/*.tsx 語系無關、routes.tsx 才按語系分流」。
//   - 不產生 routes.tsx（Astro 不需要執行期路由清單，檔案系統本身就是
//     路由表），改成依 render-routes-astro.ts 算出的 pagesRelativePath
//     直接寫檔案到對應路徑。
//   - 樣式（index.css）沿用 render-global-css.ts，跟 React 版完全共用。
//
// load-static-data.ts / resolve-route.ts / plan-routes.ts 完全不動（這正是
// plan-routes.ts 開頭註解裡提到的「之後也可以直接餵給 Astro 產生器」）。
//
// 輸出目錄配置（outDir 底下，對照 Astro 專案的 `src/pages/` 佈局）：
//   pages/index.astro                        單語系首頁，或多語系 defaultLocale 不帶前綴版本
//   pages/about.astro
//   pages/en/index.astro                      多語系帶前綴版本（每個語系一份）
//   pages/en/about.astro
//   pages/_data/index/data.ts                 跟上面每份 .astro 檔案一一對應的資料檔案，
//   pages/_data/about/data.ts                 放在平行的 _data/ 子目錄底下（不能跟 .astro
//   pages/_data/en/index/data.ts              檔案同名放在 pages/ 同一層，會被 Astro 誤認成
//   pages/_data/en/about/data.ts              另一個路由），由對應的 .astro 用相對路徑 import。
//   index.css                                 全站合併套用所有樣式表（跟 React 版一致）
//
// 這裡的 outDir 建議指到 Astro 專案的 `src/` 目錄（例如
// apps/astro-site/src），這樣 `${outDir}/pages/**/*.astro` 就會落在 Astro
// 慣例的 `src/pages/` 底下，可以直接被 Astro 專案吃到；`${outDir}/index.css`
// 則交由 Astro 專案自己的入口（例如 layout 或 global import）引用。
// ============================================================

import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import { loadStaticData } from "./load-static-data.ts";
import { planAllRoutes } from "./plan-routes.ts";
import type { RenderPageAstroOptions, RenderedPageAstro } from "./astro-codegen/render-page-astro.ts";
import { planAstroRouteFiles } from "./astro-codegen/render-routes-astro.ts";
import { renderGlobalCss } from "./jsx-codegen/render-global-css.ts";

export interface GenerateAstroOptions {
  /** 攤平資料根目錄（含 sources/、pages.json、locales.json、style-sheets.json）。 */
  dataDir: string;
  /**
   * 產出目錄，會被整個 rm + 重建：請指到一個獨立、專門放產生結果的資料夾
   * （例如 apps/astro-site/src），不要指到放了手寫 astro.config.mjs /
   * layouts 等檔案的目錄本身。
   *
   * 產出內容：`${outDir}/pages/**\/*.astro`、`${outDir}/pages/**\/data.ts`、
   * `${outDir}/index.css`。
   */
  outDir: string;
  /** monorepo 根目錄，預設從 apps/site-generator 往上兩層推。 */
  workspaceRoot?: string;
  log?: (message: string) => void;
}

export interface GenerateAstroResult {
  /** 每個 (page, locale) 產出的 .astro 檔案。 */
  pages: { pageId: string; locale: string; file: string }[];
  /** 每個 (page, locale) 產出的 data.ts（純容器頁沒有純值 props 時不會出現在這裡）。 */
  dataFiles: { pageId: string; locale: string; file: string }[];
  /** 合併樣式檔（index.css）的輸出相對路徑。 */
  generatedFiles: { styles: string };
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

export async function generateAstro(options: GenerateAstroOptions): Promise<GenerateAstroResult> {
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
  const pagesOut: GenerateAstroResult["pages"] = [];
  const dataFilesOut: GenerateAstroResult["dataFiles"] = [];
  let generatedFiles: GenerateAstroResult["generatedFiles"];

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
    const { renderPageAstro } = (await server.ssrLoadModule(
      path.join(workspaceRoot, "apps/site-generator/src/astro-codegen/render-page-astro.ts"),
    )) as {
      renderPageAstro: (opts: RenderPageAstroOptions) => RenderedPageAstro;
    };

    const store = new InMemoryDataStore(data.sources, typeRegistry);

    // defaultLocale 判斷邏輯跟 generate-split-jsx.ts 一致（同一個權威來源：
    // typedData:siteInfo:main）。各 generate* 進入點是平行、不互相依賴的
    // 產出路徑，各自保留一份短小的判斷邏輯，不硬拉共用模組。
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

    // plan-routes.ts 決定「實際要產出哪些路徑」，跟 React 版共用同一份規劃
    // 邏輯（見該檔案開頭三條規則）。
    const plannedRoutes = planAllRoutes(data.pages, data.locales, {
      sources: data.sources,
      defaultLocale,
      onWarning: (msg) => {
        warnings.push(msg);
        log(`⚠️  ${msg}`);
      },
    });
    log(`共 ${plannedRoutes.length} 筆規劃路徑（預設語系：${defaultLocale}）`);

    // outDir 是這支程式獨佔的資料夾，每次執行整個清掉重建（見檔案開頭說明）。
    await rm(options.outDir, { recursive: true, force: true });
    const pagesDir = path.join(options.outDir, "pages");
    await mkdir(pagesDir, { recursive: true });

    const pageById = new Map(data.pages.map((p) => [p.id, p] as const));

    // ---- 頁面 + 資料檔案：每個 PlannedRoute 各自落地一份 .astro（+ 同目錄
    // data.ts），跟 React 版不同（頁面元件語系無關、routes.tsx 才按語系
    // 分流），Astro 只有 file route，沒有「一份元件給多語系共用」的機制，
    // 只能每個 (page, locale) 各自產生完整檔案（見 render-page-astro.ts
    // 「做法 B」說明）。----
    const astroRouteFiles = planAstroRouteFiles(plannedRoutes);
    for (const routeFile of astroRouteFiles) {
      const { page, locale } = routeFile.planned.resolved;
      const pageDef = pageById.get(page.id);
      if (!pageDef) continue;

      // pagesRelativePath 是「不含副檔名的檔案路徑」（例如 "about"、
      // "en/about"、單語系或 defaultLocale 首頁時是 "index"）——直接對應
      // 需求的 `/page1.astro`、`/[locale]/page1.astro` 檔案佈局（Astro file
      // route：檔案路徑本身就是路由，不是「每個路由一個資料夾 + index.astro」）。
      // data.ts 不能跟 .astro 檔案同名放在同一層 `pages/` 底下（會被誤認成
      // 另一個路由），改放到平行的 `pages/_data/<同樣路徑>/data.ts`，
      // .astro 檔案用相對路徑 import 這個子目錄——這裡先算好相對路徑，
      // renderPageAstro() 才知道 import 字串要怎麼寫。
      const depth = routeFile.pagesRelativePath.split("/").length;
      const upDirs = "../".repeat(depth);
      const dataImportPath = `${upDirs}_data/${routeFile.pagesRelativePath}/data`;

      const result = renderPageAstro({ page: pageDef, locale, defaultLocale, store, dataImportPath });
      for (const w of result.warnings) {
        warnings.push(w);
        log(`⚠️  ${w}`);
      }

      const astroDir = path.dirname(path.join(pagesDir, routeFile.pagesRelativePath));
      await mkdir(astroDir, { recursive: true });
      const astroFile = path.join(pagesDir, `${routeFile.pagesRelativePath}.astro`);
      await writeFile(astroFile, result.astroCode, "utf-8");
      pagesOut.push({ pageId: page.id, locale, file: path.relative(options.outDir, astroFile) });
      log(`✓ pages/${routeFile.pagesRelativePath}.astro（${page.id}，${locale}）`);

      if (result.dataCode) {
        const dataDir = path.join(pagesDir, `_data/${routeFile.pagesRelativePath}`);
        await mkdir(dataDir, { recursive: true });
        const dataFile = path.join(dataDir, "data.ts");
        await writeFile(dataFile, result.dataCode, "utf-8");
        dataFilesOut.push({ pageId: page.id, locale, file: path.relative(options.outDir, dataFile) });
        log(`✓ pages/_data/${routeFile.pagesRelativePath}/data.ts`);
      }
    }

    // ---- 樣式：index.css（跟 React 版共用同一顆 codegen 函式） ----
    const stylesFile = path.join(options.outDir, "index.css");
    await writeFile(stylesFile, renderGlobalCss(data.styleSheets), "utf-8");
    log(`✓ index.css（合併 ${data.styleSheets.length} 份樣式表）`);

    generatedFiles = { styles: path.relative(options.outDir, stylesFile) };
  } finally {
    await server.close();
  }

  log(`完成，共產出 ${pagesOut.length} 份 .astro、${dataFilesOut.length} 份 data.ts、index.css。`);
  return { pages: pagesOut, dataFiles: dataFilesOut, generatedFiles: generatedFiles!, warnings };
}
