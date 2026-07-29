// ============================================================
// render-page-split-jsx —— 單一 (page, locale) 產出「頁面 .tsx + 拆開的資料
// 檔案」，取代 render-page-jsx.ts 那種「props 全部 inline 寫在頁面 .tsx
// 裡」的做法。
//
// 對照 apps/web-builder/src/pages/index.tsx：
//
//   import { Layout } from "@workspace/ui/components/landing1/layout";
//   import { Hero } from "@workspace/ui/components/landing1/hero";
//   ...
//   import { header, footer, hero, valueProps, ctaBanner } from "@workspace/ui/components/landing1/default";
//
//   export default function HomePage() {
//     return (
//       <Layout header={header} footer={footer}>
//         <Hero {...hero} />
//         <ValueProps {...valueProps} />
//         <CtaBanner {...ctaBanner} />
//       </Layout>
//     );
//   }
//
// 這裡把 "@workspace/ui/components/landing1/default" 換成產生出來的資料
// 檔案（可能一個頁面一份，也可能拆成多份——由呼叫端提供的
// DataFileGroupingStrategy 決定，見 data-file-writer.ts）。
//
// 語系與元件解耦（做法 A）：
//   頁面元件本身不 import 任何特定語系的資料檔案，而是透過 `data` prop
//   接收——同一個 <HomePage data={...} /> 元件可以被多個語系的 <Route>
//   重用，呼叫端（routes.tsx，見 jsx-codegen/render-routes.ts）負責在每個
//   (page, locale) 各自 import 對應語系的資料檔案，再當作 `data` 傳進來。
//
//   export default function HomePage({ data }: { data: HomePageData }) {
//     const { layout, hero, ctaBanner, contactCard, ctaBanner2 } = data;
//     return (
//       <Layout {...layout}>
//         <Hero {...hero} />
//         ...
//       </Layout>
//     );
//   }
//
//   對照的 `HomePageData` 型別（跟資料檔案裡的具名 export 一一對應）也是
//   這支程式產生的，見下方 renderPageSplitJsx() 的 dataTypeName。
//
// resolveValue() 已經在產資料檔案那一步把 i18n 綁定欄位 resolve 成純值，
// 所以資料檔案本身（data/<locale>/<pageId>/*.ts）跟以前一樣不含任何
// i18n/resolve 邏輯；改變的只是「頁面 .tsx 從哪裡拿到這份值」。
// ============================================================

import type { DataStore } from "../../src/lib/data-model/schema";
import type { PageItem } from "../../src/lib/page-model";
import { ImportCollector } from "./jsx-codegen/import-collector";
import { walkBlockListToSplitJsx } from "./jsx-codegen/render-block-tree-to-split-jsx";
import { VarNameAllocator } from "./jsx-codegen/var-naming";
import {
  groupAllInOneFile,
  groupByComponentName,
  renderDataFileNamedAndDefaultExport,
  type DataFileGroup,
} from "./jsx-codegen/data-file-writer";

export interface RenderPageSplitJsxOptions {
  page: PageItem;
  /**
   * 用哪個語系的資料來決定「這個頁面用了哪些組件、哪些變數名稱、資料形狀
   * 長什麼樣子」——頁面元件本身跟語系無關（見檔案開頭說明），但要產生
   * JSX 結構（`{...hero}`）跟對應的 `HomePageData` 型別，仍需要挑一個語系
   * 實際 resolve 一次資料，取得變數名稱／型別清單。用哪個語系 resolve
   * 結果都一樣（同一頁在不同語系底下的「用了哪些組件」不會變，只有值本身
   * 不同），呼叫端通常會傳 defaultLocale。
   */
  shapeLocale: string;
  store: DataStore;
  /**
   * 資料檔案怎麼分檔。預設 "all-in-one"（整頁一份 data.ts，是最接近
   * roadmap 需求範例的分法），也可以換成 "by-component"（每個組件名稱
   * 各自一份）。
   *
   * 故意用字串名稱指定，而不是直接傳 DataFileGroupingStrategy 函式參照：
   * 主流程（generate-split-jsx.ts）是透過 Vite SSR（server.ssrLoadModule）
   * 動態載入這個檔案，呼叫端拿到的函式參照跟這個模組內部 import 的
   * groupAllInOneFile / groupByComponentName 不一定是同一個模組實例
   * （SSR 模組圖各自載入，不保證共用同一份），直接把外部函式參照傳進來
   * 呼叫會壞掉（`dataFileGrouping is not a function`）。字串在這個模組
   * 內部對應成實際策略函式，就不會跨 SSR 邊界傳函式。
   */
  dataFileGrouping?: "all-in-one" | "by-component";
}

export interface RenderedDataFile {
  /** 檔名（含副檔名），例如 "data.ts" 或 "hero.ts"。呼叫端決定實際輸出路徑（可能跟頁面 .tsx 不同目錄）。 */
  fileName: string;
  code: string;
}

/**
 * 產生資料檔案用的 (page, locale) 選項，跟頁面元件本身（locale 無關）分開。
 *
 * 這裡固定輸出「具名 export 全部保留 + 多一個彙總 default export」的資料
 * 檔案（見 renderPageDataFiles() 內部固定用 groupAllInOneFile +
 * renderDataFileNamedAndDefaultExport，不吃 dataFileGrouping 選項）——因為
 * 這批資料檔案有兩種消費端：routes.tsx 需要「一行 import 拿到整包」
 * （`import home_zh_TW from "./data/zh-TW/home/data"`），同時具名 export
 * （例如 `hero`）保留給其他可能單獨引用某個區塊的地方用。
 *
 * 如果之後真的需要「拆成多檔給人工瀏覽/比對」的版本，那是另一個獨立的輸出
 * 目的，data-file-writer.ts 的 groupByComponentName / renderDataFileContent
 * 兩個函式還留著（見該檔案），可以另外接一條路徑產生，不影響這裡。
 */
export interface RenderPageDataFilesOptions {
  page: PageItem;
  locale: string;
  /**
   * 站台的預設語系。傳給底層 resolveValue() 的 ResolveContext.defaultLocale，
   * 用來判斷「綁定到站內頁面（route target=page）的值」要不要加上 locale
   * 前綴（見 schema.ts ResolveContext / resolveRouteSourceValue 的說明）：
   * locale === defaultLocale 時不加前綴，其餘語系會變成 "/{locale}{path}"，
   * 跟這個頁面自己的路由前綴規則（resolve-route.ts）保持一致。
   */
  defaultLocale: string;
  store: DataStore;
  /** HomePageData 型別名稱（來自 renderPageSplitJsx() 的回傳值），用來幫 default export 標 `satisfies HomePageData`。省略時不標型別。 */
  dataTypeName?: string;
  /** HomePageData 型別所在模組的 import 路徑（頁面元件檔案，例如 "../../pages/HomePage"）。與 dataTypeName 同時提供或同時省略。 */
  dataTypeImportPath?: string;
}

export interface RenderedPageSplitJsx {
  /** 頁面本身的 `.tsx` 檔案內容：純元件，透過 `data` prop 接收資料，不 import 任何特定語系的資料檔案。 */
  pageCode: string;
  /** 建議檔名（不含副檔名），例如 "HomePage"。 */
  componentName: string;
  /** 對應的資料型別名稱（例如 "HomePageData"），routes.tsx 需要它來標註傳進去的 data 型別。 */
  dataTypeName: string;
  /**
   * 這個頁面資料形狀底下的分檔資訊（每個檔案裡有哪些具名 export 及其型別），
   * 供呼叫端（generate-split-jsx.ts / render-routes.ts）知道「每個 locale
   * 的資料檔案要匯出哪些具名變數、routes.tsx 該怎麼把它們組成一個 data
   * 物件傳給頁面元件」。跟 renderPageDataFiles() 對同一個 (page, locale)
   * 呼叫時，用的是同一套 dataFileGrouping 分組策略，兩者形狀保證一致。
   */
  dataShape: DataFileGroup[];
  warnings: string[];
}

/** page.id 轉成合法的 PascalCase React 元件名稱，跟 render-page-jsx.ts 用同一套規則。 */
function pageIdToComponentName(pageId: string): string {
  const words = pageId
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  const base = words.join("") || "Page";
  const safe = /^[0-9]/.test(base) ? `Page${base}` : base;
  return `${safe}Page`;
}

/** page.id 轉成合法的 PascalCase data 型別名稱，例如 "home" -> "HomePageData"。 */
function pageIdToDataTypeName(pageId: string): string {
  return `${pageIdToComponentName(pageId)}Data`;
}

/**
 * 產出一個 page 對應的「頁面 .tsx」（不含資料檔案；資料檔案改由
 * renderPageDataFiles() 對每個 locale 分別產生，見下方）。
 *
 * 頁面元件本身跟語系無關（做法 A，見檔案開頭說明）：
 *   - 不 import 任何資料檔案，改成 `{ data }: { data: HomePageData }` prop。
 *   - JSX 內部用 `const { hero, ctaBanner, ... } = data;` 解構出跟以前一樣
 *     的變數名稱，之後的 `{...hero}` spread 寫法完全不變（walkBlockListToSplitJsx
 *     產出的 JSX 片段不用改）。
 *   - 同時 export 一個 `HomePageData` type，讓呼叫端（routes.tsx）import
 *     資料檔案時可以用它標型別、也方便自己手動組 data 物件時有型別檢查。
 *
 * options.shapeLocale：用哪個語系的資料 resolve 一次，取得「這頁用了哪些
 * 組件、變數名稱、型別」——頁面結構（用了哪些組件）在所有語系底下是一樣的，
 * 只有值不同，所以挑一個語系（通常是 defaultLocale）resolve 一次即可決定
 * 整份頁面元件 + 型別的形狀。
 */
export function renderPageSplitJsx(options: RenderPageSplitJsxOptions): RenderedPageSplitJsx {
  const { page, shapeLocale, store } = options;
  const dataFileGrouping = options.dataFileGrouping === "by-component" ? groupByComponentName : groupAllInOneFile;
  const warnings: string[] = [];
  const componentImports = new ImportCollector();
  const varNames = new VarNameAllocator();

  const { jsx: bodyJsx, dataExports, isEmpty } = walkBlockListToSplitJsx(
    page.blocks,
    {
      locale: shapeLocale,
      // 這裡只是為了 resolve 出「用了哪些組件、資料形狀長什麼樣」，不是
      // 真正要輸出的值，所以 defaultLocale 直接傳 shapeLocale 本身即可——
      // locale === defaultLocale 時 route 綁定值不會被加上 locale 前綴
      // （見 schema.ts resolveRouteSourceValue），形狀判斷不受影響。呼叫端
      // 傳進來的 shapeLocale 慣例上本來就是站台的 defaultLocale（見
      // RenderPageSplitJsxOptions.shapeLocale 的說明）。
      defaultLocale: shapeLocale,
      store,
      componentImports,
      varNames,
      onWarning: (message) => warnings.push(`[${page.id}/${shapeLocale}] ${message}`),
    },
    2,
  );

  const groups: DataFileGroup[] = dataFileGrouping(dataExports);

  // 型別 import（HeroProps 等）：頁面 .tsx 現在改成宣告一個 HomePageData
  // type（把每個 varName 的型別集合起來），仍然需要 import 各組件的
  // props 型別，邏輯跟 data-file-writer.ts 的 typeImports 收集方式一致。
  const typeImports = new ImportCollector();
  for (const exp of dataExports) {
    if (exp.propsTypeName) {
      typeImports.add(exp.propsTypeImportPath, exp.propsTypeName);
    }
  }
  const typeImportsSource = typeImports.render({ typeOnly: true });

  const componentName = pageIdToComponentName(page.id);
  const dataTypeName = pageIdToDataTypeName(page.id);
  const componentImportsSource = componentImports.render();
  const importsSource = [componentImportsSource, typeImportsSource].filter(Boolean).join("\n");

  // HomePageData 型別本體：一個 varName 一個欄位，跟資料檔案裡的具名 export
  // 一一對應（見 data-file-writer.ts renderDataFileContent 的欄位型別註記
  // 邏輯，這裡刻意保持同一套規則，兩邊才會兜得起來）。
  const dataTypeFields = dataExports
    .map((exp) => {
      const typeAnnotation = exp.propsTypeName
        ? exp.omittedPropKeys.length > 0
          ? `Omit<${exp.propsTypeName}, ${exp.omittedPropKeys.map((k) => JSON.stringify(k)).join(" | ")}>`
          : exp.propsTypeName
        : "Record<string, unknown>";
      return `  ${exp.varName}: ${typeAnnotation};`;
    })
    .join("\n");
  const dataTypeSource = dataExports.length > 0 ? `export interface ${dataTypeName} {\n${dataTypeFields}\n}\n\n` : "";

  // 元件內部解構：`const { hero, ctaBanner } = data;`——變數名稱沿用
  // walkBlockListToSplitJsx 配好的 varName，JSX 片段（{...hero}）不用改。
  const destructure =
    dataExports.length > 0 ? `  const { ${dataExports.map((e) => e.varName).join(", ")} } = data;\n\n` : "";

  // 沒有任何資料 export 的頁面（純容器組件）不需要 data prop，元件簽名退回
  // 無參數版本，避免產生一個永遠是空物件、沒有任何欄位的 `{}` 型別。
  const propsSignature = dataExports.length > 0 ? `{ data }: { data: ${dataTypeName} }` : "";

  // 空頁面（沒有任何頂層 block）直接回傳單行空 fragment，不需要
  // `{null}` 這種顯式佔位節點——`<></>` 本身就是合法、可讀的「無內容」
  // 表示法，跟其他頁面「有幾個 root block 才需要 <>...</> 包起來」的判斷
  // 是同一件事的特例，不算額外複雜度。
  const returnBody = isEmpty ? "<></>" : page.blocks.length !== 1 ? `<>\n${bodyJsx}\n    </>` : bodyJsx.trimStart();

  const pageCode = `// ============================================================
// 此檔案由 site-generator（apps/site-generator/src/render-page-split-jsx.ts）自動產生，
// 請勿手動編輯——重新執行產生器即會覆蓋這裡的內容。
//
// 來源頁面：${page.id}（${page.name}）
// 語系無關：這個元件不 import 任何特定語系的資料，透過 \`data\` prop 接收，
// 由呼叫端（routes.tsx）針對每個語系各自傳入對應的 data（見
// jsx-codegen/render-routes.ts），同一份元件可以被所有語系重用。
// 資料形狀：${groups.map((g) => `${g.fileBaseName}.ts`).join(", ") || "（此頁沒有任何純值 props，全部是純容器組件）"}
// ============================================================

${importsSource ? `${importsSource}\n\n` : ""}${dataTypeSource}export default function ${componentName}(${propsSignature}) {
${destructure}  return (
    ${returnBody}
  );
}
`;

  return { pageCode, componentName, dataTypeName, dataShape: groups, warnings };
}

/**
 * 產出一個 (page, locale) 對應的資料檔案（不含頁面 .tsx，見上方
 * renderPageSplitJsx()）。呼叫端要對每個 locale 各呼叫一次，取得每個語系
 * 各自的資料檔案內容；再由 routes.tsx 依 locale 匯入對應版本、傳給
 * （locale 無關的）頁面元件。
 *
 * 固定用 groupAllInOneFile（一個 page + 一個 locale = 一個檔案）+
 * renderDataFileNamedAndDefaultExport（具名 export 全部保留 + 多一個彙總
 * default export），不吃 dataFileGrouping 選項——原因見
 * RenderPageDataFilesOptions 上的說明。varName（具名 export 的變數名，也是
 * default export 物件的 key）沿用 walkBlockListToSplitJsx 配好的名稱，跟
 * renderPageSplitJsx() 產生的 `const { hero, ctaBanner } = data;` 解構
 * 對得起來。
 */
export function renderPageDataFiles(options: RenderPageDataFilesOptions): {
  dataFiles: RenderedDataFile[];
  warnings: string[];
} {
  const { page, locale, defaultLocale, store, dataTypeName, dataTypeImportPath } = options;
  const warnings: string[] = [];
  const componentImports = new ImportCollector();
  const varNames = new VarNameAllocator();

  const { dataExports } = walkBlockListToSplitJsx(
    page.blocks,
    {
      locale,
      defaultLocale,
      store,
      componentImports,
      varNames,
      onWarning: (message) => warnings.push(`[${page.id}/${locale}] ${message}`),
    },
    2,
  );

  const groups: DataFileGroup[] = groupAllInOneFile(dataExports);

  const dataHeaderComment = (fileBaseName: string) => `// ============================================================
// 此檔案由 site-generator（apps/site-generator/src/render-page-split-jsx.ts）
// 自動產生，請勿手動編輯——重新執行產生器即會覆蓋這裡的內容。
//
// 來源頁面：${page.id}（${page.name}） · 分組：${fileBaseName}
// 語系：${locale}（resolved 純值，此檔案不含任何 i18n/resolve 邏輯）
// 具名 export 逐一保留（給其他地方單獨引用），額外多一個彙總 default
// export：routes.tsx 一行 import 整包（見 render-routes.ts）。
// ============================================================`;

  const dataFiles: RenderedDataFile[] = groups.map((group) => ({
    fileName: `${group.fileBaseName}.ts`,
    code: renderDataFileNamedAndDefaultExport(group, dataHeaderComment(group.fileBaseName), {
      dataTypeName,
      dataTypeImportPath,
    }),
  }));

  return { dataFiles, warnings };
}