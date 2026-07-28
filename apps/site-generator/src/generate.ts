// ============================================================
// generate —— 主流程：載入資料 -> 走訪 locale x page -> render -> 寫檔
//
// 這個檔案本身不含任何 JSX / React 邏輯（那些都在 render-page.ts /
// site-renderer），只負責：
//   1. 呼叫 load-static-data 讀攤平資料
//   2. 用 Vite 的 SSR module runner 載入 render-page.ts（讓 @workspace/ui
//      底下的 .tsx 組件可以被直接 import、且 tsconfig 的
//      @workspace/ui/* alias 生效 —— 這是 apps/web-builder 本來就在用的
//      同一套工具鏈，這裡只是換成程式化呼叫而不是啟動 dev server）
//   3. resolveAllRoutes 展開所有 (locale, page) 組合
//   4. 呼叫 renderPage，把結果寫進 outDir
//
// 之所以要透過 Vite SSR（而不是直接 `import()` render-page.ts），是因為
// @workspace/ui 的 package.json exports 直接指向 .tsx/.ts 原始碼、預期由
// bundler 處理（JSX 轉譯 + tsconfig path alias），純 Node ESM 沒有這些能力。
// apps/web-builder 本身也是靠 Vite 完成同樣的事，這裡沿用同一套設定，
// 不需要另外維護一份 babel/esbuild 設定。
// ============================================================

import { mkdir, writeFile, rm, cp } from "node:fs/promises";
import path from "node:path";
import { createServer, build, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import { loadStaticData } from "./load-static-data.ts";
import { resolveAllRoutes, type ResolvedRoute } from "./resolve-route.ts";
import type { RenderPageOptions, RenderedPage } from "./render-page.ts";

export interface GenerateOptions {
  /** 攤平資料根目錄（含 sources/、pages.json、locales.json、style-sheets.json）。 */
  dataDir: string;
  /** 產出網站的輸出目錄。 */
  outDir: string;
  /** monorepo 根目錄（用來定位 packages/ui），預設從 apps/site-generator 往上兩層推。 */
  workspaceRoot?: string;
  /** 印出進度用的 logger，預設 console.log；靜默模式可傳入 no-op。 */
  log?: (message: string) => void;
}

export interface GenerateResult {
  routes: ResolvedRoute[];
  warnings: string[];
}

function defaultWorkspaceRoot(): string {
  // 這個檔案位於 apps/site-generator/src/generate.ts -> 往上三層是 monorepo 根目錄。
  return path.resolve(import.meta.dirname, "../../..");
}

/**
 * 建立一個 Vite 中介模式的 dev server，僅用來透過 ssrLoadModule 載入
 * render-page.ts（連帶載入它 import 的所有 @workspace/ui 組件與
 * data-model 邏輯）。不會真的監聽任何 port。
 *
 * alias 設定刻意跟 apps/web-builder/vite.config.ts 一致（"@workspace/ui"
 * -> packages/ui/src），確保這裡載入到的組件跟編輯器畫布用的是同一份原始碼，
 * 不是另外複製一份設定卻悄悄跑歪。
 */
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
      // packages/ui 的原始碼是 .ts/.tsx 而非預先編譯過的套件，交給 Vite SSR 直接轉譯，
      // 不要被當成「已經是合法 Node 模組」的 external 依賴略過轉換。
      noExternal: ["@workspace/ui"],
    },
    optimizeDeps: { noDiscovery: true },
    logLevel: "warn",
  });
}

/**
 * 建置期單一 CSS 產物：把 packages/ui/src/styles/globals.css 當入口，
 * 讓 Tailwind v4（@source 指令 + @tailwindcss/vite）掃過 packages/ui/src
 * 底下所有 .tsx（也就是掃過所有可能被 blocks 用到的組件），輸出成一份
 * 雜湊檔名的 CSS，供每個靜態頁的 <link rel="stylesheet"> 使用。
 *
 * 這裡刻意「整站一份 CSS」而不是每頁各自產生：landing1 組件集本來就共用
 * 同一份 design token（globals.css 的 @theme），拆成多份只會讓瀏覽器
 * 重複下載幾乎相同的內容，對這個規模的站沒有實益。
 */
async function buildCss(workspaceRoot: string, outDir: string): Promise<string> {
  // site.css 實際放在 apps/site-generator/src/（不是 src/client/ ——
  // 這裡之前指錯路徑了，只是因為 rollupOptions.input 用絕對路徑組出來，
  // 誤值恰好沒有立刻炸掉），對照 readme.md 的專案結構說明訂正。
  const entryDir = path.join(workspaceRoot, "apps/site-generator/src");
  const cssEntry = path.join(entryDir, "site.css");

  // Vite 8（改用 Rolldown 底層）在 build.cssCodeSplit: false 時，
  // rollupOptions.input 不允許直接指向 .css 檔（會丟出
  // "rolldownOptions.input should not include CSS files"）。
  // 用一個只 import CSS 的虛擬 JS 入口繞過去：對輸出沒有影響
  // （cssCodeSplit:false 仍然只會產出一份 site.css，JS 產物直接忽略），
  // 但滿足 Rolldown 對 input 型別的限制。
  const virtualEntryId = "\0site-generator:css-entry";
  const cssEntryPlugin = {
    name: "site-generator-css-entry",
    resolveId(id: string) {
      if (id === virtualEntryId) return virtualEntryId;
      return null;
    },
    load(id: string) {
      if (id === virtualEntryId) {
        return `import ${JSON.stringify(cssEntry)};`;
      }
      return null;
    },
  };

  await build({
    root: entryDir,
    plugins: [cssEntryPlugin, tailwindcss()],
    resolve: {
      alias: {
        "@workspace/ui": path.join(workspaceRoot, "packages/ui/src"),
      },
    },
    build: {
      outDir: path.join(outDir, "assets"),
      emptyOutDir: false,
      cssCodeSplit: false,
      rollupOptions: {
        input: virtualEntryId,
        output: {
          // 固定檔名（不雜湊）：靜態站沒有 Vite 的 manifest 可查，renderPage
          // 需要在 render 之前就知道確切的 <link href>，固定檔名讓
          // buildCss() 的回傳值跟實際寫出的檔案保證一致。之後若要上雜湊
          // 做長效快取，改成回傳 build() 的結果（含 bundle 檔名）即可，
          // 這裡先用最簡單、可預期的做法。
          assetFileNames: "site.css",
          // 虛擬入口編譯出來的 JS 產物（其實是空的，因為裡面只有一行
          // side-effect-only 的 CSS import）也固定檔名，避免額外寫出一份
          // 雜湊檔名的 .js 到 assets/ 卻沒人用。
          entryFileNames: "site-css-entry.js",
        },
      },
    },
    logLevel: "warn",
  });
  return "/assets/site.css";
}

/**
 * 主流程：讀資料 -> 建 SSR 環境 -> 逐頁 render -> 寫檔。
 *
 * 每個 (locale, page) 各自 render 成一份 HTML，寫到
 * `${outDir}${route.outputFile}`（例如 `dist/en/about/index.html`）。
 * 找不到組件、渲染失敗等問題不會中斷整個流程（跟 site-renderer 的 fallback
 * 機制一致），全部收集進回傳值的 warnings，交由呼叫端（cli.ts）決定要不要
 * 因此讓 process exit code 非 0。
 */
export async function generate(options: GenerateOptions): Promise<GenerateResult> {
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
  let routes: ResolvedRoute[] = [];

  try {
    const { InMemoryDataStore, resolveValue } = await server.ssrLoadModule("@workspace/ui/lib/data-model/schema") as
      typeof import("@workspace/ui/lib/data-model/schema");
    const { renderPage } = await server.ssrLoadModule(
      path.join(workspaceRoot, "apps/site-generator/src/render-page.ts"),
    ) as { renderPage: (opts: RenderPageOptions) => Promise<RenderedPage> };
    const { typeRegistry, SiteInfoDataTypeId } = await server.ssrLoadModule(
      "@workspace/ui/lib/data-model/sample-data",
    ) as typeof import("@workspace/ui/lib/data-model/sample-data");
    // defaultSiteInfo 並不是從 sample-data 匯出的（sample-data 只在內部私下
    // import 它來組出 sources，並未 re-export），真正的公開匯出點是
    // lib/data-model/index.ts（再往上溯源自 components/site/default.ts）。
    // 之前從 sample-data 這個 module namespace 解構 defaultSiteInfo 一定會拿到
    // undefined，才會在下面存取 .defaultLocale 時整個爆掉。
    const { defaultSiteInfo } = await server.ssrLoadModule(
      "@workspace/ui/lib/data-model",
    ) as typeof import("@workspace/ui/lib/data-model");

    const store = new InMemoryDataStore(data.sources, typeRegistry);

    // defaultLocale 是「哪個語系不加路徑前綴」的依據，權威來源是 App 設定
    // 綁定的 SiteInfoData（typedData:siteInfo:main）。找不到該筆資料，或
    // resolveValue 失敗，就退回 data.locales 裡第一個語系，避免整個流程中斷。
    const siteInfoSource = store.getSource("typedData:siteInfo:main");
    let defaultLocale = data.locales[0] ?? "en";
    if (siteInfoSource?.kind === "typedData") {
      const resolved = resolveValue(
        typeRegistry[SiteInfoDataTypeId],
        siteInfoSource.value,
        store,
        { locale: data.locales[0] ?? "en" },
      ) as { defaultLocale?: unknown };
      if (typeof resolved.defaultLocale === "string" && resolved.defaultLocale) {
        defaultLocale = resolved.defaultLocale;
      }
    } else {
      defaultLocale = defaultSiteInfo.defaultLocale || defaultLocale;
    }

    routes = resolveAllRoutes(data.pages, data.locales, {
      sources: data.sources,
      defaultLocale,
      onWarning: (msg) => {
        warnings.push(msg);
        log(`⚠️  ${msg}`);
      },
    });
    log(`共 ${routes.length} 個頁面 x 語系組合待產出（預設語系：${defaultLocale}）`);

    await rm(options.outDir, { recursive: true, force: true });
    await mkdir(options.outDir, { recursive: true });

    log("建置 CSS…");
    const cssHref = await buildCss(workspaceRoot, options.outDir);

    for (const route of routes) {
      const result = await renderPage({
        route,
        store,
        styleSheets: data.styleSheets,
        cssHref,
      });
      for (const w of result.warnings) {
        warnings.push(w);
        log(`⚠️  ${w}`);
      }

      const outFile = path.join(options.outDir, route.outputFile);
      await mkdir(path.dirname(outFile), { recursive: true });
      await writeFile(outFile, result.html, "utf-8");
      log(`✓ ${route.outputFile}`);
    }
  } finally {
    await server.close();
  }

  // 靜態檔案（例如 apps/site-generator 自己的 public/，若存在）直接複製到輸出目錄。
  const publicDir = path.join(workspaceRoot, "apps/site-generator/public");
  await cp(publicDir, options.outDir, { recursive: true, force: true }).catch(() => {
    // public/ 不存在是正常情況（樣板專案可能還沒放任何靜態資產），不視為錯誤。
  });

  log(`完成，共產出 ${routes.length} 個頁面。`);
  return { routes, warnings };
}