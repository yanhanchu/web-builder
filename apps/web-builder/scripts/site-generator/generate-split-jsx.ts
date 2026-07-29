// ============================================================
// generate-split-jsx —— 主流程（拆分資料版）：載入資料 -> 產生
// 「頁面 .tsx + 拆開的資料檔案 + 路由 + 樣式」-> 寫檔
//
// 對照 generate-jsx.ts（props 直接 inline 寫進頁面 .tsx 的版本），差異只在
// 於 render-page-jsx.ts 換成 render-page-split-jsx.ts：純值 props 不再
// inline，而是拆成獨立資料檔案，頁面 .tsx 改用 `{...varName}` spread 引用
// （見 render-page-split-jsx.ts 檔案開頭的範例對照）。
//
// 重要邊界：outDir 不會被整個清空，每次執行只會覆寫這次產出實際用到的
// 檔案路徑（pages/*.tsx、data/<locale>/<pageId>/*.ts、routes.tsx、
// index.css），outDir 底下其他既有檔案（含上一輪產出但這次沒再產生的
// 檔案）會被保留。index.html / main.tsx / App.tsx（BrowserRouter、layout
// 等殼層）不在這支程式的產出範圍內，交由外部手動維護——呼叫端仍建議把
// outDir 指到一個「專門放產生結果」的獨立資料夾（例如
// apps/web-builder/src/generated），避免跟手寫檔案混放時路徑剛好撞名
// 而被覆寫。
//
// 輸出目錄配置（outDir 底下）：
//   pages/<ComponentName>.tsx               頁面本身（語系無關，透過 data prop 接收資料，見
//                                            render-page-split-jsx.ts 檔案開頭「做法 A」說明）
//   data/<locale>/<pageId>/<group>.ts        每個 (page, locale) 拆出的資料檔案（所有語系都會產生，
//                                            不是只有 defaultLocale）
//   routes.tsx                               由 plan-routes.ts 算出的 PlannedRoute[] 組成 <GeneratedRoutes />
//                                             （只是路由清單，不含 BrowserRouter，見 render-routes.ts；
//                                             每個 (page, locale) 各自 import 對應資料檔案傳給頁面元件）
//   index.css                                style-sheets.json 全部合併套用（見下方「樣式」）
//
// 外部手寫的 App.tsx 用法範例：
//   import { GeneratedRoutes } from "./generated/routes";
//   import "./generated/index.css";
//   export function App() {
//     return (
//       <BrowserRouter>
//         <GeneratedRoutes />
//       </BrowserRouter>
//     );
//   }
//
// 「檔案不一定在同一個，可能 by 區塊或語系分開」：
//   - by 語系：本來就照 locale 分資料夾（data/<locale>/...），每個 locale
//     各自一組完整的資料檔案，互不共用。
//   - by 區塊：同一個 (page, locale) 底下，資料檔案本身可以再依
//     DataFileGroupingStrategy 拆成多份（見 data-file-writer.ts），預設
//     groupAllInOneFile（整頁一份），也可以換成 groupByComponentName
//     （每個組件名稱各自一份，例如 hero.ts / footer.ts）。
//
// 頁面 .tsx（pages/*.tsx）本身跟語系無關：只用「其中一個語系」（shapeLocale，
// 固定用 defaultLocale）resolve 一次來決定「用了哪些組件、資料形狀長怎樣」，
// 產出的元件透過 `data` prop 接收資料，不 import 任何資料檔案本身——每個
// (page, locale) 的資料檔案都會產生（不再只有 defaultLocale 那組），真正
// import 這些資料檔案的是 routes.tsx（每個 Route 各自 import 自己語系的
// 資料，見 render-routes.ts）。
//
// 路由（routes.tsx）：改用 plan-routes.ts 的 planAllRoutes() 規劃要產生
// 哪些路徑（單語系不加前綴；多語系則 defaultLocale 不帶前綴的第一層 +
// 所有語系都帶前綴的第二層；沒有路由資料的頁面整批跳過，見 plan-routes.ts
// 開頭說明）。同一個 page 可能對應多筆 route（不同語系），但都指向同一份
// pages/*.tsx（一個 page 只寫一份元件檔案）。還沒做 route-level code
// splitting（React.lazy），全部頁面元件都是一般 import，打包成同一個
// bundle。
//
// 樣式（index.css）：現階段先簡化成「全站合併套用所有樣式表」——把
// style-sheets.json 的每一筆都 concat 進同一份 index.css，不看
// page.styleSheetIds。之後如果要做到「每頁精準套用」，只需要換掉
// jsx-codegen/render-global-css.ts 這個 codegen 函式，其餘流程不用動。
//
// load-static-data.ts / resolve-route.ts 完全不動（跟輸出格式無關）。
//
// 產出目錄由呼叫端透過 GenerateSplitJsxOptions.outDir 指定，
// cli-split-jsx.ts 也已經支援 `--out <路徑>` 這個 CLI 參數。
// ============================================================

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import { loadStaticData } from "./load-static-data.ts";
import { planAllRoutes } from "./plan-routes.ts";
import type {
  RenderPageSplitJsxOptions,
  RenderPageDataFilesOptions,
  RenderedPageSplitJsx,
} from "./render-page-split-jsx.ts";
import { renderRoutes, type RouteEntry } from "./jsx-codegen/render-routes.ts";
import { renderGlobalCss } from "./jsx-codegen/render-global-css.ts";

export interface GenerateSplitJsxOptions {
  /** 攤平資料根目錄（含 sources/、pages.json、locales.json、style-sheets.json）。 */
  dataDir: string;
  /**
   * 產出目錄，不會被整個清空：只會覆寫這次產出實際用到的檔案路徑（見檔案
   * 開頭說明），其他既有檔案會被保留。建議指到一個獨立、專門放產生結果的
   * 資料夾（例如 apps/web-builder/src/generated），避免跟手寫
   * index.html/main.tsx/App.tsx 混放時路徑撞名而被覆寫。
   *
   * 產出內容：`${outDir}/pages/*.tsx`、`${outDir}/data/<locale>/<pageId>/*.ts`、
   * `${outDir}/routes.tsx`、`${outDir}/index.css`。
   */
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
  /** 每個「有路由資料的已發佈頁面」產出一份 .tsx（語系無關，見 render-page-split-jsx.ts）。 */
  pages: { pageId: string; file: string }[];
  /** 每個 (page, locale) 產出的所有資料檔案。 */
  dataFiles: { pageId: string; locale: string; file: string }[];
  /** 路由檔（routes.tsx）與合併樣式檔（index.css）的輸出相對路徑。 */
  generatedFiles: { routes: string; styles: string };
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
  // try 區塊內才知道實際路徑（依賴 SSR 載入結果算出的 defaultLocale 等），
  // 這裡先宣告，區塊結束後一定會被賦值（沒賦值就代表中途拋錯，函式本身
  // 也不會走到下面的 return）。
  let generatedFiles: GenerateSplitJsxResult["generatedFiles"];

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
    const { renderPageSplitJsx, renderPageDataFiles } = (await server.ssrLoadModule(
      path.join(workspaceRoot, "apps/web-builder/scripts/site-generator/render-page-split-jsx.ts"),
    )) as {
      renderPageSplitJsx: (opts: RenderPageSplitJsxOptions) => RenderedPageSplitJsx;
      renderPageDataFiles: (
        opts: RenderPageDataFilesOptions,
      ) => { dataFiles: { fileName: string; code: string }[]; warnings: string[] };
    };

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

    // plan-routes.ts 決定「實際要產出哪些路徑」：單語系不加前綴；多語系則
    // defaultLocale 不帶前綴的第一層 + 所有語系都帶前綴的第二層；沒有路由
    // 資料的頁面整批跳過（見 plan-routes.ts 開頭三條規則）。
    const plannedRoutes = planAllRoutes(data.pages, data.locales, {
      sources: data.sources,
      defaultLocale,
      onWarning: (msg) => {
        warnings.push(msg);
        log(`⚠️  ${msg}`);
      },
    });
    log(`共 ${plannedRoutes.length} 筆規劃路徑（預設語系：${defaultLocale}，資料分組策略：${groupingName}）`);

    // outDir 不會被清空：只會覆寫這次產出會用到的檔案路徑（pages/*.tsx、
    // data/<locale>/<pageId>/*.ts、routes.tsx、index.css），outDir 底下
    // 其他既有檔案（含上一輪產出但這次沒再產生的檔案）會被保留下來，不會
    // 被刪除。呼叫端仍建議把 outDir 指到獨立的子資料夾，避免跟手寫檔案
    // 混放時路徑剛好撞名而被覆寫。
    const pagesDir = path.join(options.outDir, "pages");
    const dataRootDir = path.join(options.outDir, "data");
    await mkdir(pagesDir, { recursive: true });
    await mkdir(dataRootDir, { recursive: true });

    // ---- 頁面元件：一個 page 只產生一份 .tsx（語系無關，見
    // render-page-split-jsx.ts「做法 A」說明），用 defaultLocale 當
    // shapeLocale resolve 一次，決定用了哪些組件、資料形狀。只處理
    // plannedRoutes 裡真的有出現的 page（沒有路由資料、被 plan-routes.ts
    // 跳過的頁面，不產生元件檔案）。
    const plannedPageIds = new Set(plannedRoutes.map((r) => r.resolved.page.id));
    const pageById = new Map(data.pages.map((p) => [p.id, p] as const));
    const componentNameByPageId = new Map<string, string>();
    const dataTypeNameByPageId = new Map<string, string>();
    const dataShapeByPageId = new Map<string, { fileBaseName: string; exports: { varName: string }[] }[]>();

    for (const pageId of plannedPageIds) {
      const page = pageById.get(pageId);
      if (!page) continue;
      const result = renderPageSplitJsx({
        page,
        shapeLocale: defaultLocale,
        store,
        dataFileGrouping: groupingName,
      });
      for (const w of result.warnings) {
        warnings.push(w);
        log(`⚠️  ${w}`);
      }

      const fileName = `${result.componentName}.tsx`;
      const outFile = path.join(pagesDir, fileName);
      await writeFile(outFile, result.pageCode, "utf-8");
      pagesOut.push({ pageId, file: path.relative(options.outDir, outFile) });
      componentNameByPageId.set(pageId, result.componentName);
      if (result.dataShape.length > 0) dataTypeNameByPageId.set(pageId, result.dataTypeName);
      dataShapeByPageId.set(pageId, result.dataShape);
      log(`✓ pages/${fileName}（${pageId}，語系無關）`);
    }

    // ---- 資料檔案：每個「plannedRoutes 裡實際用到的 (page, locale)」各
    // 產生一份，不再只寫 defaultLocale。用 Set 去重：規則 2 的第一層／
    // 第二層可能對同一個 (page, locale) 各規劃一筆（例如 defaultLocale 的
    // 不帶前綴版本 + 帶前綴版本），資料檔案本身跟前綴無關，只需要寫一次。
    const seenPageLocale = new Set<string>();
    for (const planned of plannedRoutes) {
      const { page, locale } = planned.resolved;
      const key = `${page.id}::${locale}`;
      if (seenPageLocale.has(key)) continue;
      seenPageLocale.add(key);

      const dataTypeName = dataTypeNameByPageId.get(page.id);
      const componentName = componentNameByPageId.get(page.id);
      // 資料檔案在 data/<locale>/<pageId>/data.ts，頁面元件在
      // pages/<Component>.tsx，往回三層（<pageId>/ -> <locale>/ -> data/）
      // 再進 pages/ 才能找到型別定義。
      const dataTypeImportPath =
        dataTypeName && componentName ? `../../../pages/${componentName}` : undefined;

      const result = renderPageDataFiles({
        page,
        locale,
        defaultLocale,
        store,
        dataTypeName,
        dataTypeImportPath,
      });
      for (const w of result.warnings) {
        warnings.push(w);
        log(`⚠️  ${w}`);
      }

      const pageDataDir = path.join(dataRootDir, locale, page.id);
      await mkdir(pageDataDir, { recursive: true });
      for (const dataFile of result.dataFiles) {
        const outFile = path.join(pageDataDir, dataFile.fileName);
        await writeFile(outFile, dataFile.code, "utf-8");
        dataFilesOut.push({ pageId: page.id, locale, file: path.relative(options.outDir, outFile) });
        log(`✓ data/${locale}/${page.id}/${dataFile.fileName}`);
      }
    }

    // ---- 路由：routes.tsx（只是 <Routes>，不含 BrowserRouter/App 殼層） ----
    // 直接用 plannedRoutes（plan-routes.ts 算好的完整清單），每一筆對應一個
    // <Route>，並各自組出要 import 哪些資料檔案的具名 export（跟上面資料
    // 檔案分組邏輯 dataShapeByPageId 對齊，保證 routes.tsx import 的變數
    // 名稱跟資料檔案裡真正 export 的名稱一致）。
    const routeEntries: RouteEntry[] = plannedRoutes
      .filter((planned) => componentNameByPageId.has(planned.resolved.page.id))
      .map((planned) => {
        const { page, locale } = planned.resolved;
        const componentName = componentNameByPageId.get(page.id)!;
        const dataTypeName = dataTypeNameByPageId.get(page.id);
        const dataShape = dataShapeByPageId.get(page.id) ?? [];
        // renderPageDataFiles() 內部固定用 groupAllInOneFile + 單一 default
        // export（見 render-page-split-jsx.ts 開頭說明），所以每個
        // (page, locale) 最多只有一份資料檔案，固定檔名 "data"。空陣列
        // （純容器頁，沒有任何純值 props）就不產生 dataImportPath。
        // 頁面元件固定在 pages/<Component>.tsx，資料檔案固定在
        // data/<locale>/<pageId>/data.ts，routes.tsx 跟 pages/ 同一層
        // 目錄，所以相對路徑是 "./data/<locale>/<pageId>/data"。
        const dataImportPath =
          dataShape.length > 0 ? `./data/${locale}/${page.id}/${dataShape[0].fileBaseName}` : undefined;
        return {
          planned,
          componentName,
          componentImportPath: `./pages/${componentName}`,
          dataTypeName,
          dataTypeImportPath: dataTypeName ? `./pages/${componentName}` : undefined,
          dataImportPath,
        };
      });

    const routesFile = path.join(options.outDir, "routes.tsx");
    await writeFile(routesFile, renderRoutes(routeEntries), "utf-8");
    log(`✓ routes.tsx（${routeEntries.length} 條路由）`);

    // ---- 樣式：index.css（現階段全站合併套用所有樣式表，不分頁） ----
    const stylesFile = path.join(options.outDir, "index.css");
    await writeFile(stylesFile, renderGlobalCss(data.styleSheets), "utf-8");
    log(`✓ index.css（合併 ${data.styleSheets.length} 份樣式表）`);

    generatedFiles = {
      routes: path.relative(options.outDir, routesFile),
      styles: path.relative(options.outDir, stylesFile),
    };
  } finally {
    await server.close();
  }

  log(`完成，共產出 ${pagesOut.length} 份 .tsx、${dataFilesOut.length} 份資料檔案、routes.tsx、index.css。`);
  return { pages: pagesOut, dataFiles: dataFilesOut, generatedFiles: generatedFiles!, warnings };
}