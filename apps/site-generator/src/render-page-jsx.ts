// ============================================================
// render-page-jsx —— 單一 (page, locale) 產出「.tsx 原始碼字串」
//
// 對照 render-page.ts（產出完整 HTML 字串），這個檔案產出的是可以直接被
// 其他專案 import 的 React 組件原始碼，長得像
// apps/web-builder/src/pages/index.tsx 手寫的樣子，差別是資料來自
// data-model resolve，而不是手寫 import 寫死物件（見 roadmap.md）。
//
// - locale 在產出當下就固定死：所有 i18n 綁定欄位都用 resolveValue() 解成
//   純值，直接 dump 成 JSX attribute。輸出的 `.tsx` 是這個 locale 的靜態
//   內容，不支援、也不需要在瀏覽器裡動態切換 locale。
// - 不做 Header/Footer 特殊處理：跟 render-page.ts 一致，只負責把
//   page.blocks render 成內容——如果頁面資料裡本身有把 Header/Footer 放進
//   blocks，就會自然被包含在輸出的 JSX 裡；沒有的話這裡不额外加。
//
// 產出的 .tsx 結構：
//   import { Hero } from "@workspace/ui/components/landing1/hero";
//   // ...（其餘用到的組件）
//
//   export default function <ComponentName>() {
//     return (
//       <>
//         <Hero ... />
//         ...
//       </>
//     );
//   }
// ============================================================

import type { DataStore } from "@workspace/ui/lib/data-model/schema";
import type { PageItem } from "@workspace/ui/lib/page-model";
import { ImportCollector } from "./jsx-codegen/import-collector";
import { renderBlockListToJsx } from "./jsx-codegen/render-block-tree-to-jsx";

export interface RenderPageJsxOptions {
  page: PageItem;
  locale: string;
  store: DataStore;
}

export interface RenderedPageJsx {
  /** 完整 `.tsx` 檔案內容（含 import 語句 + export default 組件）。 */
  code: string;
  /** 建議的檔名（不含副檔名），例如 "HomePage"。呼叫端決定實際輸出路徑。 */
  componentName: string;
  /** 產生過程中遇到、但不足以中斷整體流程的問題（找不到組件等）。 */
  warnings: string[];
}

/** page.id（例如 "home"、"about-us"）轉成合法的 PascalCase React 元件名稱。 */
function pageIdToComponentName(pageId: string): string {
  const words = pageId
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  const base = words.join("") || "Page";
  // 元件名稱不能以數字開頭（合法 JS identifier 規則）。
  const safe = /^[0-9]/.test(base) ? `Page${base}` : base;
  return `${safe}Page`;
}

/**
 * 產出一個 (page, locale) 對應的 `.tsx` 原始碼字串。
 *
 * 跟 renderPage()（render-page.ts）不同，這裡不需要呼叫
 * preloadBlockTreeComponents / renderToStaticMarkup —— code generator
 * 只需要 getComponentById() 查 ComponentDoc 拿 importPath/componentName，
 * 不需要真的載入、執行任何組件模組。
 */
export function renderPageJsx(options: RenderPageJsxOptions): RenderedPageJsx {
  const { page, locale, store } = options;
  const warnings: string[] = [];
  const imports = new ImportCollector();

  const bodyJsx = renderBlockListToJsx(page.blocks, {
    locale,
    store,
    imports,
    onWarning: (message) => warnings.push(`[${page.id}/${locale}] ${message}`),
  }, 2);

  const componentName = pageIdToComponentName(page.id);
  const importsSource = imports.render();

  const code = `// ============================================================
// 此檔案由 site-generator（apps/site-generator/src/render-page-jsx.ts）自動產生，
// 請勿手動編輯——重新執行產生器即會覆蓋這裡的內容。
//
// 來源頁面：${page.id}（${page.name}）
// 語系：${locale}（i18n 綁定欄位已在產出時 resolve 成純值，此檔案不支援動態切換 locale）
// ============================================================

${importsSource ? `${importsSource}\n\n` : ""}export default function ${componentName}() {
  return (
    <>
${bodyJsx}
    </>
  );
}
`;

  return { code, componentName, warnings };
}
