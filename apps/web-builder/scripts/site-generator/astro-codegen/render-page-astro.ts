// ============================================================
// render-page-astro —— 單一 page 產出「一份 .astro 動態路由檔案」，資料
// 本身完全重用 render-page-split-jsx.ts 的 renderPageDataFiles()（跟 React
// split-jsx 版輸出一模一樣的 data.ts 內容），不再另外設計一套 Astro 專用的
// 資料格式。
//
// 對照第一版（每個 (page, locale) 各自落地一份完整 .astro）的兩個修正：
//
//   1. 「data 完全拿 jsx 匯出的 data 來用，想要的是一模一樣」：資料檔案
//      現在直接呼叫 render-page-split-jsx.ts 匯出的 renderPageDataFiles()，
//      不再有一份 Astro 專用的 renderAstroDataFile()——內容（具名 export +
//      彙總 default export、型別註記）逐字跟 split-jsx 版一致，唯一差異只
//      是「寫到哪個目錄」由呼叫端（generate-astro.ts）決定。
//   2. 「語系資料夾應該是 /[lang]/{page}，[lang] 不應該替換成真實語系，要
//      透過 ssg 腳本生成」：改用 Astro 的動態路由片段 `[lang]`——一個 page
//      只產生一份 `.astro` 檔案（跟語系無關，做法對照 render-page-split-jsx
//      的「做法 A」：頁面結構只 resolve 一次），檔案內用
//      `export function getStaticPaths()`（Astro 官方的 SSG 展開機制）
//      逐一列出 data.locales，每個語系對應一組 `params: { lang }` +
//      `props: { data }`，執行期由 Astro build 自己展開成
//      `/en/about`、`/zh-TW/about` 等靜態頁面——不是產生器在檔案系統裡
//      手動複製一份 `en/about.astro`。
//
// 第一層（無前綴）預設語系頁面：`pages/[lang]/` 底下的動態路由只會展開出
// `/en/about`、`/zh-TW/about` 這種「帶語系前綴」的網址，不會有
// `/about`（不帶前綴、預設語系直接用根路徑）這種頁面——這是 i18n 路由的
// 常見慣例（跟 resolve-route.ts 的 withLocalePrefix() 規則一致：
// defaultLocale 不加前綴）。所以另外用 renderPageAstroRoot() 產生一份
// `pages/{page}.astro`（不帶 `[lang]/`，直接寫死用 defaultLocale 的資料，
// 沒有 getStaticPaths()，就是一般的靜態頁面），對照：
//
//   pages/about.astro          固定用 defaultLocale 的資料（例如 zh-TW）
//   pages/[lang]/about.astro   getStaticPaths() 展開 data.locales 全部語系
//                              （含 defaultLocale 本身，所以 defaultLocale
//                              同時可以透過 /about 或 /zh-TW/about 存取，
//                              是否要在 [lang] 版本排除 defaultLocale 交由
//                              呼叫端決定，見 generate-astro.ts）
//
// 範例輸出（precis 版，對照 roadmap 的參考結構；home 頁、雙語系 en/zh-TW）：
//
//   data/home/_i18n.ts:
//     import * as en from "../en/home/data";
//     import * as zh_TW from "../zh-TW/home/data";
//     export const dataByLang = { en, "zh-TW": zh_TW } as const;
//
//   pages/[lang]/index.astro:
//     ---
//     import Layout from "@workspace/ui/components/landing1/layout";
//     import Hero from "@workspace/ui/components/landing1/hero";
//     import ValueProps from "@workspace/ui/components/landing1/value-props";
//     import CtaBanner from "@workspace/ui/components/landing1/cta-banner";
//     import { dataByLang } from "../../data/home/_i18n";
//     import { makeGetStaticPaths } from "../../../src/lib/astro-i18n/get-static-paths";
//
//     export const getStaticPaths = makeGetStaticPaths(dataByLang);
//
//     const { data } = Astro.props;
//     const { header, footer, hero, valueProps, ctaBanner } = data;
//     ---
//     <Layout header={header} footer={footer}>
//       <Hero {...hero} />
//       <ValueProps {...valueProps} />
//       <CtaBanner {...ctaBanner} />
//     </Layout>
//
// i18n 值怎麼塞（下一版再處理，跟第一版說明一致）：這一版仍是「每個語系
// 各自 resolve 成純值，各自一份 data.ts」，只是現在所有語系共用同一份
// `.astro` 樣板檔案（透過 getStaticPaths 在建置期展開），不再每個語系各自
// 一份重複的 .astro。下一版如果要改成「執行期依 Astro.currentLocale 選字典」，
// 只需要換掉這個檔案跟 generate-astro.ts 的產出邏輯，plan-routes.ts /
// resolve-route.ts / load-static-data.ts / render-page-split-jsx.ts 完全不用動。
//
// getStaticPaths 樣板精簡（方向 C）：Astro 規定每個動態路由 `.astro` 檔案
// 都要自己 export 一個 getStaticPaths 函式（這是 Astro 編譯器寫死的規則，
// 不是慣例，不像 SvelteKit `+page.ts` 那種「同目錄檔案自動被框架抓走」的
// 機制，沒辦法完全不出現這個 export），但「怎麼從 `{ [lang]: data }` 物件
// 產生 getStaticPaths 回傳值」這段純邏輯（迴圈 + params/props 組裝）跟頁面
// 內容完全無關，抽成 `../../lib/astro-i18n/get-static-paths.ts` 的
// `makeGetStaticPaths()` 共用（回傳「已經是函式」的高階函式，見該檔案），
// `.astro` 只需要 `export const getStaticPaths = makeGetStaticPaths(dataByLang);`
// 一行。
//
// 連 import + dataByLang 組裝也一併搬到 data.ts 旁邊的一份共用檔案：每個
// page 除了 `data/<locale>/<page>/data.ts`（逐語系），還多產生一份
// `data/<page>/_i18n.ts`，裡面 import 全部語系的 data.ts、export 出組好的
// `dataByLang` 物件——`.astro` 檔案就只剩「import dataByLang + import
// makeGetStaticPaths + 呼叫」三行，每個生成頁面完全一致的樣板只剩這三行，
// 跟頁面內容有關的只剩最後的 props 解構。
// ============================================================

import type { DataStore } from "../../../src/lib/data-model/schema";
import type { PageItem } from "../../../src/lib/page-model";
import { ImportCollector } from "../jsx-codegen/import-collector";
import { VarNameAllocator } from "../jsx-codegen/var-naming";
import { renderPageDataFiles, type RenderedDataFile } from "../render-page-split-jsx.ts";
import { walkBlockListToAstro } from "./render-block-tree-to-astro";

export interface RenderPageAstroOptions {
  page: PageItem;
  /**
   * 用哪個語系的資料決定「這個頁面用了哪些組件、變數名稱、資料形狀長什麼
   * 樣子」——頁面結構在所有語系底下都一樣，只有值不同，跟
   * render-page-split-jsx.ts 的 shapeLocale 是同一個概念、同一個理由，見
   * 該檔案 RenderPageSplitJsxOptions.shapeLocale 的說明。呼叫端通常傳
   * defaultLocale。
   */
  shapeLocale: string;
  /** 站台所有啟用的語系（getStaticPaths() 要展開的完整清單），例如 ["en", "zh-TW"]。 */
  locales: string[];
  /** 站台的預設語系，見 render-block-tree-to-split-jsx.ts 同名欄位說明。 */
  defaultLocale: string;
  store: DataStore;
}

export interface RenderPageAstroFileOptions extends RenderPageAstroOptions {
  /**
   * `.astro` 檔案要用什麼相對路徑 import `_i18n.ts`（不含副檔名）——由
   * 呼叫端決定 `_i18n.ts` 實際落在哪裡（建議 `data/<pageId>/_i18n`，見
   * generate-astro.ts）。`_i18n.ts` 本身另外由 renderPageI18nFile() 產生，
   * 不是這個函式的職責。
   */
  dataI18nImportPath: string;
}

export interface RenderedPageAstro {
  /** `.astro` 檔案內容：frontmatter（imports + getStaticPaths + props 解構）+ template（block tree）。 */
  astroCode: string;
  /** 每個語系各自的 data.ts 內容（逐字沿用 renderPageDataFiles()／render-page-split-jsx.ts 的輸出，不做任何 Astro 專屬轉換）。沒有任何純值 props（純容器頁）時為空陣列。 */
  dataFilesByLocale: { locale: string; dataFile: RenderedDataFile }[];
  warnings: string[];
}

/** `data/<pageId>/_i18n.ts` 彙總檔案的內容——import 全部語系的 data.ts、export 組好的 dataByLang 物件（見 renderPageI18nFile()）。 */
export interface RenderedPageI18nFile {
  /** 檔名，固定 "_i18n.ts"。 */
  fileName: string;
  code: string;
}

/** 把語系字串轉成合法的 JS identifier（給 dataByLang 物件的 key、對照 import 的變數名用），例如 "zh-TW" -> "zh_TW"。 */
function localeToIdentifier(locale: string): string {
  const safe = locale.replace(/[^a-zA-Z0-9_$]/g, "_");
  return /^[0-9]/.test(safe) ? `_${safe}` : safe;
}

/**
 * 頁面結構（用了哪些組件、client:* 指令、資料形狀、逐語系 data.ts 內容）
 * 只跟 page 本身有關，跟「要產成 [lang] 動態路由版本還是 defaultLocale
 * 專用的根路徑版本」無關，所以抽成共用步驟，被 renderPageAstro() 和
 * renderPageAstroRoot() 各自呼叫一次，避免兩份輸出的 data.ts 內容、
 * warnings 對不起來。
 */
function renderPageShape(options: RenderPageAstroOptions): {
  componentImportsSource: string;
  dataVarNames: string[];
  bodyOut: string;
  dataFilesByLocale: { locale: string; dataFile: RenderedDataFile }[];
  warnings: string[];
} {
  const { page, shapeLocale, locales, defaultLocale, store } = options;
  const warnings: string[] = [];

  // ---- 頁面結構（用了哪些組件、client:* 指令、資料形狀）：只用
  // shapeLocale resolve 一次，理由跟 render-page-split-jsx.ts 的 shapeLocale
  // 完全一致——頁面結構跟語系無關。這裡的 dataExports 只用來取得「有哪些
  // varName」，不會被輸出成任何資料檔案（真正的資料檔案來自下面逐語系呼叫
  // renderPageDataFiles()）。----
  const shapeComponentImports = new ImportCollector();
  const shapeVarNames = new VarNameAllocator();
  const {
    template: bodyTemplate,
    dataExports: shapeDataExports,
    isEmpty,
  } = walkBlockListToAstro(
    page.blocks,
    {
      locale: shapeLocale,
      defaultLocale: shapeLocale,
      store,
      componentImports: shapeComponentImports,
      varNames: shapeVarNames,
      onWarning: (message) => warnings.push(`[${page.id}/${shapeLocale}] ${message}`),
    },
    0,
  );

  const componentImportsSource = shapeComponentImports.render();
  const dataVarNames = shapeDataExports.map((e) => e.varName);

  // ---- 資料檔案：逐語系呼叫 renderPageDataFiles()（render-page-split-jsx.ts
  // 既有函式，輸出格式跟 React split-jsx 版一模一樣），不傳
  // dataTypeName/dataTypeImportPath——Astro 版沒有一個「頁面 data prop
  // 型別」需要標注彙總型別（跟第一版的做法一致，見 renderAstroDataFile 的
  // 說明；現在直接不聲明，型別各自標注在具名 export 上）。----
  const dataFilesByLocale: { locale: string; dataFile: RenderedDataFile }[] = [];
  for (const locale of locales) {
    const result = renderPageDataFiles({ page, locale, defaultLocale, store });
    for (const w of result.warnings) warnings.push(w);
    // renderPageDataFiles() 固定用 groupAllInOneFile（見該函式說明），一個
    // (page, locale) 只會有一份資料檔案，固定檔名 "data.ts"。
    const dataFile = result.dataFiles[0];
    if (dataFile) dataFilesByLocale.push({ locale, dataFile });
  }

  const bodyOut = isEmpty ? "<Fragment></Fragment>" : bodyTemplate;

  return { componentImportsSource, dataVarNames, bodyOut, dataFilesByLocale, warnings };
}

/**
 * 產出一個 page 對應的 `data/<pageId>/_i18n.ts`——import 全部語系的
 * data.ts、export 組好的 `dataByLang` 物件。跟 `.astro` 檔案本身分開產生，
 * 因為它不屬於任何單一語系，是「這個頁面有哪些語系、對應哪個 data 模組」
 * 這件跟頁面內容無關的彙總資訊，抽出來讓 `.astro` 只需要 import 一份現成
 * 的 `dataByLang`，不用在每個頁面重複寫 import + 物件字面量（見檔案開頭
 * 「getStaticPaths 樣板精簡（方向 C）」說明）。
 */
export function renderPageI18nFile(options: {
  page: PageItem;
  locales: string[];
  dataImportPathForLocale: (locale: string) => string;
}): RenderedPageI18nFile {
  const { page, locales, dataImportPathForLocale } = options;

  // 跟 renderPageAstro() 原本的做法一致：`import * as ident` 命名空間
  // import，因為 renderPageDataFiles() 沒傳 dataTypeName 時只保留具名
  // export，沒有彙總的 default export（見 render-page-split-jsx.ts
  // renderPageDataFiles() 說明）。
  const localeIdentifiers = new Map(locales.map((l) => [l, localeToIdentifier(l)] as const));
  const dataImportLines = locales
    .map((locale) => `import * as ${localeIdentifiers.get(locale)} from "${dataImportPathForLocale(locale)}";`)
    .join("\n");
  const dataByLangEntries = locales
    .map((locale) => `  ${JSON.stringify(locale)}: ${localeIdentifiers.get(locale)},`)
    .join("\n");

  const code = `// ============================================================
// 此檔案由 site-generator（apps/site-generator/src/astro-codegen/render-page-astro.ts）
// 自動產生，請勿手動編輯——重新執行產生器即會覆蓋這裡的內容。
//
// 來源頁面：${page.id}（${page.name}）
// 彙總 ${JSON.stringify(locales)} 各語系的 data.ts，供
// \`pages/[lang]/${page.id === "home" ? "index" : page.id}.astro\` 的
// \`getStaticPaths\`（透過 makeGetStaticPaths()）使用。
// ============================================================

${dataImportLines}

export const dataByLang = {
${dataByLangEntries}
} as const;
`;

  return { fileName: "_i18n.ts", code };
}

export function renderPageAstro(options: RenderPageAstroFileOptions): RenderedPageAstro {
  const { page, locales, dataI18nImportPath } = options;
  const { componentImportsSource, dataVarNames, bodyOut, dataFilesByLocale, warnings } = renderPageShape(options);

  // ---- getStaticPaths：不再自己寫 Object.keys(...).map(...) 那段迴圈，
  // 改成 import 現成的 dataByLang（來自同一批 renderPageI18nFile() 產出的
  // `_i18n.ts`）+ 呼叫共用的 makeGetStaticPaths()（見檔案開頭「getStaticPaths
  // 樣板精簡（方向 C）」說明、../../lib/astro-i18n/get-static-paths.ts）。
  // 每個生成頁面的樣板現在只剩「import dataByLang + import
  // makeGetStaticPaths + 呼叫」三行，不再重複那段迴圈邏輯。----
  const hasData = dataFilesByLocale.length > 0;

  const getStaticPathsSource = hasData
    ? `import { dataByLang } from "${dataI18nImportPath}";
import { makeGetStaticPaths } from "../../../src/lib/astro-i18n/get-static-paths";

export const getStaticPaths = makeGetStaticPaths(dataByLang);

const { data } = Astro.props;
const { ${dataVarNames.join(", ")} } = data;`
    : `export function getStaticPaths() {
  return ${JSON.stringify(locales)}.map((lang) => ({ params: { lang } }));
}`;

  const frontmatterLines = [componentImportsSource, getStaticPathsSource].filter(Boolean).join("\n\n");

  const astroCode = `---
// ============================================================
// 此檔案由 site-generator（apps/site-generator/src/astro-codegen/render-page-astro.ts）
// 自動產生，請勿手動編輯——重新執行產生器即會覆蓋這裡的內容。
//
// 來源頁面：${page.id}（${page.name}）
// 語系無關的動態路由檔案：不屬於任何單一語系，透過 getStaticPaths()
// （Astro 官方 SSG 展開機制）在建置期為 ${JSON.stringify(locales)} 各自展開
// 成一個靜態頁面（例如 /en${page.id === "home" ? "" : "/" + page.id}、
// /zh-TW${page.id === "home" ? "" : "/" + page.id}），[lang] 這個目錄名稱
// 本身不代表任何實際語系，只是 Astro 動態路由片段的語法。
// 資料來源：dataByLang 彙總自 data/${page.id}/_i18n.ts（見
// renderPageI18nFile()），每個語系各自一份 data.ts 內容逐字沿用
// render-page-split-jsx.ts 的 renderPageDataFiles()（跟 React split-jsx
// 版輸出一模一樣）。getStaticPaths 邏輯共用自
// ../../lib/astro-i18n/get-static-paths.ts 的 makeGetStaticPaths()。
// client:* 指令依 page.blocks 各自的 clientDirective 欄位產生（見
// astro-codegen/render-block-tree-to-astro.ts 的 clientDirectiveAttr()）。
// ============================================================

${frontmatterLines}
---

${bodyOut}
`;

  return { astroCode, dataFilesByLocale, warnings };
}

export interface RenderPageAstroRootOptions extends Omit<RenderPageAstroOptions, "locales"> {
  /** defaultLocale 的 data.ts import 路徑（不含副檔名），由呼叫端決定實際落在哪裡。 */
  dataImportPath: string;
}

/**
 * 產出一個 page 對應的「`pages/{page}.astro` 根路徑檔案」——固定只用
 * defaultLocale 的資料，不含 getStaticPaths()、不接受 [lang] 參數，單純是
 * 一般的靜態頁面。跟 renderPageAstro()（`pages/[lang]/{page}.astro`）搭配
 * 使用，讓 defaultLocale 同時可以透過不帶前綴的根路徑（`/about`）跟帶前綴
 * 的 `/${defaultLocale}/about` 存取，對應 i18n 路由「defaultLocale 不加
 * 前綴」的慣例（見檔案開頭「第一層（無前綴）預設語系頁面」說明、
 * resolve-route.ts 的 withLocalePrefix()）。
 */
export function renderPageAstroRoot(options: RenderPageAstroRootOptions): RenderedPageAstro {
  const { page, defaultLocale, dataImportPath } = options;
  const { componentImportsSource, dataVarNames, bodyOut, dataFilesByLocale, warnings } = renderPageShape({
    ...options,
    locales: [defaultLocale],
  });

  // renderPageDataFiles() 不傳 dataTypeName/dataTypeImportPath 時只保留
  // 具名 export，不會有彙總的 default export（理由跟 renderPageAstro() 的
  // dataImportLines 說明一致），所以這裡也要用 `import * as ident` 命名
  // 空間 import，不能用 `import data from ...` 預設 import。
  const hasData = dataFilesByLocale.length > 0;
  const dataImportLine = hasData ? `import * as data from "${dataImportPath}";` : "";
  const destructure = hasData ? `const { ${dataVarNames.join(", ")} } = data;` : "";

  const frontmatterLines = [componentImportsSource, dataImportLine, destructure].filter(Boolean).join("\n\n");

  const astroCode = `---
// ============================================================
// 此檔案由 site-generator（apps/site-generator/src/astro-codegen/render-page-astro.ts）
// 自動產生，請勿手動編輯——重新執行產生器即會覆蓋這裡的內容。
//
// 來源頁面：${page.id}（${page.name}）
// 固定用預設語系（${defaultLocale}）的資料，不帶語系前綴的根路徑頁面，跟
// 'pages/[lang]/${page.id === "home" ? "index" : page.id}.astro'（透過
// getStaticPaths() 展開所有語系）搭配使用，對應 i18n 路由慣例：
// defaultLocale 不加前綴（見 render-page-astro.ts 開頭「第一層（無前綴）
// 預設語系頁面」說明）。
// 資料來源：data.ts 內容逐字沿用 render-page-split-jsx.ts 的
// renderPageDataFiles()（跟 React split-jsx 版輸出一模一樣）。
// client:* 指令依 page.blocks 各自的 clientDirective 欄位產生（見
// astro-codegen/render-block-tree-to-astro.ts 的 clientDirectiveAttr()）。
// ============================================================

${frontmatterLines}
---

${bodyOut}
`;

  return { astroCode, dataFilesByLocale, warnings };
}