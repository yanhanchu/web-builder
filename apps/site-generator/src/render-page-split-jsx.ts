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
// locale 在產出當下就固定死（跟 render-page-jsx.ts 一致），不支援瀏覽器裡
// 動態切換 locale；資料檔案本身也不含任何 i18n/resolve 邏輯，純粹是
// resolved 純值的靜態 export。
// ============================================================

import type { DataStore } from "@workspace/ui/lib/data-model/schema";
import type { PageItem } from "@workspace/ui/lib/page-model";
import { ImportCollector } from "./jsx-codegen/import-collector";
import { walkBlockListToSplitJsx } from "./jsx-codegen/render-block-tree-to-split-jsx";
import { VarNameAllocator } from "./jsx-codegen/var-naming";
import {
  groupAllInOneFile,
  groupByComponentName,
  renderDataFileContent,
  type DataFileGroup,
} from "./jsx-codegen/data-file-writer";

export interface RenderPageSplitJsxOptions {
  page: PageItem;
  locale: string;
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
  /** 頁面 `.tsx` 要用什麼相對路徑 import 各個資料檔案。給定資料檔案的 fileBaseName，回傳頁面 .tsx 要寫的 import 路徑（不含副檔名）。 */
  dataImportPath: (fileBaseName: string) => string;
}

export interface RenderedDataFile {
  /** 檔名（含副檔名），例如 "data.ts" 或 "hero.ts"。呼叫端決定實際輸出路徑（可能跟頁面 .tsx 不同目錄）。 */
  fileName: string;
  code: string;
}

export interface RenderedPageSplitJsx {
  /** 頁面本身的 `.tsx` 檔案內容（只有 import 語句 + JSX 結構，不含任何 inline 純值）。 */
  pageCode: string;
  /** 建議檔名（不含副檔名），例如 "HomePage"。 */
  componentName: string;
  /** 這個頁面拆出來的所有資料檔案內容。 */
  dataFiles: RenderedDataFile[];
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

/**
 * 產出一個 (page, locale) 對應的「頁面 .tsx + 資料檔案」組合。
 *
 * 跟 renderPageJsx()（render-page-jsx.ts）的差異只在於：純值 props 不再
 * inline 寫進頁面 JSX，而是被抽成資料檔案的具名 export，頁面 JSX 改用
 * `{...varName}` spread 引用。
 */
export function renderPageSplitJsx(options: RenderPageSplitJsxOptions): RenderedPageSplitJsx {
  const { page, locale, store, dataImportPath } = options;
  const dataFileGrouping = options.dataFileGrouping === "by-component" ? groupByComponentName : groupAllInOneFile;
  const warnings: string[] = [];
  const componentImports = new ImportCollector();
  const varNames = new VarNameAllocator();

  const { jsx: bodyJsx, dataExports, isEmpty } = walkBlockListToSplitJsx(
    page.blocks,
    {
      locale,
      store,
      componentImports,
      varNames,
      onWarning: (message) => warnings.push(`[${page.id}/${locale}] ${message}`),
    },
    2,
  );

  const groups: DataFileGroup[] = dataFileGrouping(dataExports);

  const dataHeaderComment = (fileBaseName: string) => `// ============================================================
// 此檔案由 site-generator（apps/site-generator/src/render-page-split-jsx.ts）
// 自動產生，請勿手動編輯——重新執行產生器即會覆蓋這裡的內容。
//
// 來源頁面：${page.id}（${page.name}） · 分組：${fileBaseName}
// 語系：${locale}（resolved 純值，此檔案不含任何 i18n/resolve 邏輯）
// ============================================================`;

  const dataFiles: RenderedDataFile[] = groups.map((group) => ({
    fileName: `${group.fileBaseName}.ts`,
    code: renderDataFileContent(group, dataHeaderComment(group.fileBaseName)),
  }));

  // 頁面 .tsx 要 import 的資料變數：varName -> 它所在的資料檔案 import 路徑。
  const dataImports = new ImportCollector();
  for (const group of groups) {
    const importPath = dataImportPath(group.fileBaseName);
    for (const exp of group.exports) {
      dataImports.add(importPath, exp.varName);
    }
  }

  const componentName = pageIdToComponentName(page.id);
  const componentImportsSource = componentImports.render();
  const dataImportsSource = dataImports.render();
  const importsSource = [componentImportsSource, dataImportsSource].filter(Boolean).join("\n");

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
// 語系：${locale}（i18n 綁定欄位已在產出資料檔案時 resolve 成純值，此檔案不支援動態切換 locale）
// 資料來源：${groups.map((g) => `${g.fileBaseName}.ts`).join(", ") || "（此頁沒有任何純值 props，全部是純容器組件）"}
// ============================================================

${importsSource ? `${importsSource}\n\n` : ""}export default function ${componentName}() {
  return (
    ${returnBody}
  );
}
`;

  return { pageCode, componentName, dataFiles, warnings };
}