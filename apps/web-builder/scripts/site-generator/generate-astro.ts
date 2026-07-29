// ============================================================
// generate-astro —— 主流程（Astro 版）：載入資料 -> 產生「每個 page 兩份
// .astro 檔案（一份不帶前綴、固定用 defaultLocale；一份 `[lang]` 動態路由，
// 透過 getStaticPaths() 在建置期展開所有語系）+ 每個 (page, locale) 一份
// data.ts」-> 寫檔。
//
// 對照 generate-split-jsx.ts（React SPA 版），差異只在於：
//   - Astro 只有 file-based route，沒有 react-router 那種「一份元件 + 多筆
//     <Route> 各自傳 data prop」的做法；改用 Astro 內建動態路由片段
//     `[lang]`——檔案系統只出現一份字面上的 `[lang]` 目錄，一個 page 只落地
//     一份 `pages/[lang]/{page}.astro`，語系清單由該檔案自己的
//     `getStaticPaths()`（Astro 官方 SSG 展開機制）在建置期展開，不是產生
//     器手動複製多份 `en/about.astro`、`zh-TW/about.astro`（見
//     render-page-astro.ts、render-routes-astro.ts 開頭說明）。
//   - i18n 路由慣例「defaultLocale 不加前綴」：`pages/[lang]/` 底下的動態
//     路由只會展開出 `/en/about`、`/zh-TW/about` 這種帶前綴的網址，另外
//     用 renderPageAstroRoot() 產生一份不帶 `[lang]/` 的
//     `pages/{page}.astro`，固定用 defaultLocale 的資料，讓 defaultLocale
//     同時可以透過 `/about` 或 `/${defaultLocale}/about` 存取（見
//     render-page-astro.ts 開頭「第一層（無前綴）預設語系頁面」說明）：
//       pages/about.astro          （defaultLocale，無前綴）
//       pages/[lang]/about.astro   （getStaticPaths() 展開全部語系）
//   - 不產生 routes.tsx（Astro 不需要執行期路由清單，檔案系統本身就是
//     路由表），改成依 render-routes-astro.ts 算出的 pagesRelativePath
//     直接寫到 `pages/${pagesRelativePath}.astro` 跟
//     `pages/[lang]/${pagesRelativePath}.astro`。
//   - data.ts「完全拿 jsx 匯出的 data 來用，想要的是一模一樣」：直接呼叫
//     render-page-split-jsx.ts 既有的 renderPageDataFiles()，內容逐字跟
//     React split-jsx 版一致，不再另外設計一套 Astro 專用的資料格式；且
//     刻意不放在 `pages/` 底下（Astro 會把 `pages/` 底下所有檔案都當成路由
//     來源，非 .astro 的資料檔案放進去有被誤認成路由或被建置流程掃到的風
//     險），改放到 `pages/` 同層的 `data/<locale>/<pageId>/data.ts`。
//   - 樣式（index.css）沿用 render-global-css.ts，跟 React 版完全共用。
//
// load-static-data.ts / resolve-route.ts 完全不動。這裡改成呼叫
// render-routes-astro.ts 的 planAstroPageRouteFiles()（對每個已發佈頁面呼叫
// 一次 resolveRoute()，取跟語系無關的 routePath），不再透過 plan-routes.ts
// 的 planAllRoutes()——後者是「把語系展開成多筆路徑」的規劃邏輯，適合每語系
// 各自落地一份檔案的場景，跟這裡「一個 page 一份 [lang] 檔案」的做法不對應。
//
// 輸出目錄配置（outDir 底下，對照 Astro 專案的 `src/` 佈局）：
//   pages/index.astro                        首頁，defaultLocale、不帶語系前綴
//   pages/about.astro                        （這兩份是根路徑版本，直接寫死用
//                                             defaultLocale 資料，見上方說明）
//   pages/[lang]/index.astro                 首頁，語系無關（[lang] 是字面上的動態路由片段，
//   pages/[lang]/about.astro                 不是任何真實語系；實際語系清單由檔案內
//                                             getStaticPaths() 在建置期展開成 /en、/zh-TW…）
//   data/index/_i18n.ts                      彙總全部語系 data.ts、export dataByLang，供
//   data/about/_i18n.ts                      [lang] 版 .astro 的 getStaticPaths 使用（見
//                                             render-page-astro.ts「getStaticPaths 樣板
//                                             精簡（方向 C）」說明）。
//   data/en/index/data.ts                    跟上面每份 .astro 一一對應、逐語系各自一份的資料
//   data/en/about/data.ts                    檔案，內容跟 React split-jsx 版一模一樣，放在
//   data/zh-TW/index/data.ts                 `pages/` 之外，避免被 Astro 誤認成路由。
//   data/zh-TW/about/data.ts
//   index.css                                全站合併套用所有樣式表（跟 React 版一致）
//
// 這裡的 outDir 建議指到 Astro 專案的 `src/` 目錄（例如
// apps/astro-site/src），這樣 `${outDir}/pages/**/*.astro` 就會落在 Astro
// 慣例的 `src/pages/` 底下，可以直接被 Astro 專案吃到；`${outDir}/index.css`
// 則交由 Astro 專案自己的入口（例如 layout 或 global import）引用。
//
// outDir 寫入策略：每次執行採「覆蓋」而非整個清空重建——只會建立/覆寫這次
// 產出涵蓋到的檔案（pages/**、data/**、index.css），outDir 底下既有但這次
// 未涵蓋到的檔案（例如已下架頁面殘留的舊 .astro/data.ts，或手動加進去的
// 檔案）會被原樣保留，不會被自動刪除。
// ============================================================

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import { loadStaticData } from "./load-static-data.ts";
import type {
  RenderPageAstroFileOptions,
  RenderPageAstroRootOptions,
  RenderedPageAstro,
  RenderedPageI18nFile,
} from "./astro-codegen/render-page-astro.ts";
import { planAstroPageRouteFiles } from "./astro-codegen/render-routes-astro.ts";
import { renderGlobalCss } from "./jsx-codegen/render-global-css.ts";

export interface GenerateAstroOptions {
  /** 攤平資料根目錄（含 sources/、pages.json、locales.json、style-sheets.json）。 */
  dataDir: string;
  /**
   * 產出目錄，採「覆蓋」寫入：只會建立/覆寫這次產出涵蓋到的檔案，不會
   * 整個清空重建，outDir 底下既有但這次未涵蓋到的檔案會被原樣保留。
   * 請指到一個獨立、專門放產生結果的資料夾（例如 apps/astro-site/src），
   * 不要指到放了手寫 astro.config.mjs / layouts 等檔案的目錄本身。
   *
   * 產出內容：`${outDir}/pages/**\/*.astro`（含 root 版跟 `[lang]/` 版）、
   * `${outDir}/data/<locale>/**\/data.ts`、`${outDir}/index.css`。
   */
  outDir: string;
  /** monorepo 根目錄，預設從 apps/site-generator 往上兩層推。 */
  workspaceRoot?: string;
  log?: (message: string) => void;
}

export interface GenerateAstroResult {
  /** 每個 page 產出的 .astro 檔案，各兩份：`pages/{page}.astro`（root，defaultLocale）跟 `pages/[lang]/{page}.astro`（動態路由）。 */
  pages: { pageId: string; file: string }[];
  /** 每個 (page, locale) 產出的 data.ts（純容器頁沒有純值 props 時不會出現在這裡）。 */
  dataFiles: { pageId: string; locale: string; file: string }[];
  /** 合併樣式檔（index.css）的輸出相對路徑。 */
  generatedFiles: { styles: string };
  warnings: string[];
}

function defaultWorkspaceRoot(): string {
  return path.resolve(import.meta.dirname, "../../../..");
}

async function createSsrServer(workspaceRoot: string): Promise<ViteDevServer> {
  return createServer({
    root: path.join(workspaceRoot, "apps/web-builder"),
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@workspace/ui": path.join(workspaceRoot, "packages/ui/src"),
        "@": path.join(workspaceRoot, "apps/web-builder/src"),
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
      "@/lib/data-model/schema",
    )) as typeof import("../../src/lib/data-model/schema");
    const { typeRegistry, SiteInfoDataTypeId } = (await server.ssrLoadModule(
      "@/lib/data-model/sample-data",
    )) as typeof import("../../src/lib/data-model/sample-data");
    const { defaultSiteInfo } = (await server.ssrLoadModule(
      "@/lib/data-model",
    )) as typeof import("../../src/lib/data-model");
    const { renderPageAstro, renderPageAstroRoot, renderPageI18nFile } = (await server.ssrLoadModule(
      path.join(workspaceRoot, "apps/web-builder/scripts/site-generator/astro-codegen/render-page-astro.ts"),
    )) as {
      renderPageAstro: (opts: RenderPageAstroFileOptions) => RenderedPageAstro;
      renderPageAstroRoot: (opts: RenderPageAstroRootOptions) => RenderedPageAstro;
      renderPageI18nFile: (opts: {
        page: (typeof data.pages)[number];
        locales: string[];
        dataImportPathForLocale: (locale: string) => string;
      }) => RenderedPageI18nFile;
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

    // render-routes-astro.ts 決定「每個已發佈頁面要落地到 pages/[lang]/
    // 底下哪個檔案路徑」，一個 page 一筆（語系交給 getStaticPaths() 在
    // 執行期展開，不在這裡按 locale 複製多份，見該檔案開頭說明）。
    const astroRouteFiles = planAstroPageRouteFiles(data.pages, {
      sources: data.sources,
      defaultLocale,
      onWarning: (msg) => {
        warnings.push(msg);
        log(`⚠️  ${msg}`);
      },
    });
    log(`共 ${astroRouteFiles.length} 筆規劃路徑（語系交由 getStaticPaths() 展開：${JSON.stringify(data.locales)}）`);

    // outDir 每次執行採「覆蓋」寫入：只會建立/覆寫這次產出涵蓋到的檔案，
    // 不會整個清空重建，因此 outDir 底下若有這次執行未涵蓋到的既有檔案
    // （例如手動新增的檔案），會被原樣保留（見檔案開頭說明）。
    const pagesDir = path.join(options.outDir, "pages");
    const langDir = path.join(pagesDir, "[lang]");
    const dataRootDir = path.join(options.outDir, "data");
    await mkdir(pagesDir, { recursive: true });
    await mkdir(langDir, { recursive: true });

    // ---- 頁面：每個 AstroPageRouteFile 落地兩份 .astro：
    //   pages/${pagesRelativePath}.astro          （root，固定 defaultLocale，見檔案開頭說明）
    //   pages/[lang]/${pagesRelativePath}.astro    （動態路由，getStaticPaths() 展開全部語系）
    // + 一份 `data/${pagesRelativePath}/_i18n.ts`（彙總全部語系的 data.ts，
    // 供 [lang] 版 .astro 的 getStaticPaths 使用，見 render-page-astro.ts
    // 「getStaticPaths 樣板精簡（方向 C）」說明）
    // + 逐語系各自一份 data.ts（放在 pages/ 之外的
    // `data/<locale>/<pageId>/data.ts`，內容完全沿用 render-page-split-jsx.ts
    // 的 renderPageDataFiles()，跟 React split-jsx 版一模一樣；兩份 .astro
    // 共用同一批 data.ts，只需要寫一次）。----
    for (const routeFile of astroRouteFiles) {
      const { page, pagesRelativePath } = routeFile;

      // data.ts 落在 `data/<locale>/<pagesRelativePath>/data`，_i18n.ts
      // 落在 `data/<pagesRelativePath>/_i18n`。
      //   - root 版 .astro 落在 `pages/${pagesRelativePath}.astro`，回到
      //     outDir 只要跳 1 層（離開 `pages/`），再加上 pagesRelativePath
      //     本身的巢狀層級。
      //   - [lang] 版 .astro 落在 `pages/[lang]/${pagesRelativePath}.astro`，
      //     多一層 `[lang]/`，所以要多跳 1 層（共 2 層 + 巢狀層級）。
      //   - _i18n.ts 落在 `data/${pagesRelativePath}/_i18n.ts`，它跟逐語系
      //     data.ts 同樣掛在 `data/` 底下，import data.ts 時只要跳 1 層
      //     （離開 `${pagesRelativePath}/` 這層，回到 `data/`）再加上
      //     pagesRelativePath 本身的巢狀層級，不用再多跳到 outDir。
      const nestedDepth = pagesRelativePath.split("/").length - 1;
      const rootUpDirs = "../".repeat(1 + nestedDepth);
      const langUpDirs = "../".repeat(2 + nestedDepth);
      const i18nUpDirs = "../".repeat(1 + nestedDepth);
      const rootDataImportPath = (locale: string) => `${rootUpDirs}data/${locale}/${pagesRelativePath}/data`;
      const i18nDataImportPath = (locale: string) => `${i18nUpDirs}${locale}/${pagesRelativePath}/data`;
      const dataI18nImportPath = `${langUpDirs}data/${pagesRelativePath}/_i18n`;

      // -- root 版（pages/${pagesRelativePath}.astro，固定 defaultLocale）--
      const rootResult = renderPageAstroRoot({
        page,
        shapeLocale: defaultLocale,
        defaultLocale,
        store,
        dataImportPath: rootDataImportPath(defaultLocale),
      });
      for (const w of rootResult.warnings) {
        warnings.push(w);
        log(`⚠️  ${w}`);
      }
      const rootAstroDir = path.dirname(path.join(pagesDir, pagesRelativePath));
      await mkdir(rootAstroDir, { recursive: true });
      const rootAstroFile = path.join(pagesDir, `${pagesRelativePath}.astro`);
      await writeFile(rootAstroFile, rootResult.astroCode, "utf-8");
      pagesOut.push({ pageId: page.id, file: path.relative(options.outDir, rootAstroFile) });
      log(`✓ pages/${pagesRelativePath}.astro（${page.id}，root/${defaultLocale}）`);

      // -- [lang] 版（pages/[lang]/${pagesRelativePath}.astro，展開全部語系）--
      const langResult = renderPageAstro({
        page,
        shapeLocale: defaultLocale,
        locales: data.locales,
        defaultLocale,
        store,
        dataI18nImportPath,
      });
      for (const w of langResult.warnings) {
        warnings.push(w);
        log(`⚠️  ${w}`);
      }
      const langAstroDir = path.dirname(path.join(langDir, pagesRelativePath));
      await mkdir(langAstroDir, { recursive: true });
      const langAstroFile = path.join(langDir, `${pagesRelativePath}.astro`);
      await writeFile(langAstroFile, langResult.astroCode, "utf-8");
      pagesOut.push({ pageId: page.id, file: path.relative(options.outDir, langAstroFile) });
      log(`✓ pages/[lang]/${pagesRelativePath}.astro（${page.id}）`);

      // -- _i18n.ts：彙總全部語系的 data.ts，供上面 [lang] 版 .astro 的
      // getStaticPaths（makeGetStaticPaths(dataByLang)）使用。----
      if (langResult.dataFilesByLocale.length > 0) {
        const i18nFile = renderPageI18nFile({
          page,
          locales: data.locales,
          dataImportPathForLocale: i18nDataImportPath,
        });
        const i18nDir = path.join(dataRootDir, pagesRelativePath);
        await mkdir(i18nDir, { recursive: true });
        const i18nFilePath = path.join(i18nDir, i18nFile.fileName);
        await writeFile(i18nFilePath, i18nFile.code, "utf-8");
        log(`✓ data/${pagesRelativePath}/${i18nFile.fileName}`);
      }

      // -- data.ts：兩份 .astro 都是從同一批 page.blocks 逐語系 resolve
      // 出來的，內容一模一樣，用 [lang] 版算出的 dataFilesByLocale（涵蓋
      // 全部語系，包含 defaultLocale）寫一次即可，不用對 root 版再寫一次。----
      for (const { locale, dataFile } of langResult.dataFilesByLocale) {
        const dataDir = path.join(dataRootDir, locale, pagesRelativePath);
        await mkdir(dataDir, { recursive: true });
        const dataFilePath = path.join(dataDir, dataFile.fileName);
        await writeFile(dataFilePath, dataFile.code, "utf-8");
        dataFilesOut.push({ pageId: page.id, locale, file: path.relative(options.outDir, dataFilePath) });
        log(`✓ data/${locale}/${pagesRelativePath}/${dataFile.fileName}`);
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