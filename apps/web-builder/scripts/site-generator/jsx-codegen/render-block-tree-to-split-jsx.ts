// ============================================================
// render-block-tree-to-split-jsx —— 把 PageBlock 樹轉成「頁面 JSX + 拆開的
// 資料 export」兩部分，取代 render-block-tree-to-jsx.ts 那種「props 直接
// inline 寫在 JSX attribute 裡」的做法。
//
// 對照 apps/web-builder/src/pages/index.tsx 手寫的樣子：
//
//   import { header, footer, hero, valueProps, ctaBanner } from ".../default";
//   ...
//   <Hero {...hero} />
//
// 這裡的邏輯：
//   - 每個 block 的「純值 props」不再直接 dump 成一堆 JSX attribute，而是
//     被抽成一筆 DataExport，呼叫端負責寫進資料檔案（可以是同一個檔案，也
//     可以按區塊/語系拆成多份，由呼叫端決定怎麼分檔）。
//   - 頁面 JSX 改成 `<Hero {...hero} />` 這種 spread 寫法。
//   - "children" 這個 ReactNode slot 直接渲染成真正的 JSX children
//     （`<Layout>...</Layout>`），其餘 ReactNode slot（例如具名子組件陣列）
//     仍以 `key={...}` attribute 形式維持巢狀 JSX，不會被抽成資料。
//
// 遞迴走訪 block 樹、resolve SharedBlockRef、拆 slot/plain props、抽
// DataExport 這些邏輯跟 astro-codegen 完全共用，實作在
// ../shared/walk-block-tree.ts，這裡只提供 JSX 特有的語法（開合標籤、
// fragment 寫法、找不到組件時的註解語法）。
// ============================================================

import type { DataStore } from "../../../src/lib/data-model/schema";
import type { AnyPageNode, SharedBlockDefinition } from "../../../src/lib/page-model";
import type { ImportCollector } from "../shared/import-collector";
import { walkBlockTree, INDENT_UNIT, type WalkSyntax } from "../shared/walk-block-tree";
import type { VarNameAllocator } from "../shared/var-naming";
import type { DataExport } from "../shared/data-export";

export type { DataExport } from "../shared/data-export";

export interface RenderBlockTreeToSplitJsxOptions {
  locale: string;
  /**
   * 站台的預設語系，透過 resolvePlainProps -> resolveValue 傳給
   * ResolveContext.defaultLocale，用來決定「綁定到站內頁面（route
   * target=page）的值」要不要加上 locale 前綴（見 schema.ts 說明）。
   */
  defaultLocale: string;
  store: DataStore;
  /**
   * 共用區塊定義查表（key 為 SharedBlockDefinition.id，來自
   * loadStaticData() 回傳的 sharedBlocks 陣列組成的 map），用來把樹裡的
   * SharedBlockRef 節點 resolve 成等效的 PageBlock——跟畫布渲染
   * （site-renderer/render-block-tree.tsx）、另一套 codegen
   * （astro-codegen）共用同一份 page-model 的 resolveSharedBlockRef 邏輯。
   * 沒有任何 SharedBlockRef 的樹可以傳空物件 `{}`。
   */
  definitions: Record<string, SharedBlockDefinition>;
  /** 收集這個 block 樹用到的所有「組件」import（`@workspace/ui/...`）。 */
  componentImports: ImportCollector;
  /**
   * 幫每個 block 配一個資料變數名稱，同一個檔案（同一次呼叫端建立的
   * allocator）內保證唯一。呼叫端決定要不要每個 locale/區塊各自建一個
   * allocator（決定了同一批變數名稱要不要跨頁重來）。
   */
  varNames: VarNameAllocator;
  onWarning?: (message: string) => void;
}

export interface SplitJsxNodeResult {
  /** 這個 block（含巢狀 slot 底下所有子 block）走訪出來的 JSX 原始碼片段。 */
  jsx: string;
  /** 走訪過程中抽出的所有資料 export（含巢狀 slot 子節點的），依走訪順序排列。 */
  dataExports: DataExport[];
}

export interface SplitJsxWalkResult extends SplitJsxNodeResult {
  /**
   * 這次走訪的是空陣列（頁面完全沒有任何頂層 block）。呼叫端（
   * render-page-split-jsx.ts）用這個旗標決定要不要產生 `<></>`，而不是
   * 印出 `{null}` 佔位符——空頁面直接回傳空 fragment 即可，不需要一個
   * 顯式的 null 節點。單一節點不會是空陣列，這個旗標只在「整個頁面的
   * blocks 陣列」這一層才有意義。
   */
  isEmpty: boolean;
}

/** JSX 特有語法：<>...</> fragment、 註解、無 client:* 屬性、純值 children 不特別拉出來。 */
const jsxSyntax: WalkSyntax = {
  missingComponentComment: (pad, componentId) => `${pad}{/* 找不到組件定義：${componentId} */}`,
  fragmentOpenTag: "<>",
  fragmentCloseTag: "</>",
  openTag: (componentName, attrLines, singleLineAttr, pad) =>
    attrLines.length === 0
      ? `<${componentName}>`
      : singleLineAttr !== null
        ? `<${componentName} ${singleLineAttr}>`
        : `<${componentName}\n${attrLines.join("\n")}\n${pad}>`,
  selfClosingTag: (componentName, attrLines, singleLineAttr, pad) =>
    attrLines.length === 0
      ? `<${componentName} />`
      : singleLineAttr !== null
        ? `<${componentName} ${singleLineAttr} />`
        : `<${componentName}\n${attrLines.join("\n")}\n${pad}/>`,
  // JSX 版目前沒有「純值 children 要顯式拉出來」的情境（不提供
  // formatPlainChildrenExpr，維持原本行為：留在 spread 物件裡）。
};

/**
 * 遞迴把單一 block 轉成「JSX 片段 + 資料 export 清單」。
 * indentLevel：這個節點的起始縮排層級。
 *
 * SharedBlockRef 節點會先用 resolveSharedBlockRef() 展開成等效的
 * PageBlock 再繼續走原本邏輯（跟畫布渲染、另一套 codegen 共用同一份
 * page-model 邏輯，不在這裡另外發明一套）。找不到對應的
 * SharedBlockDefinition 時直接拋出明確錯誤中止整個生成——生成器產出的是
 * 最終網站，引用失效不該悄悄漏產出一塊內容，不像畫布渲染那樣可以顯示錯誤
 * 狀態後讓使用者繼續編輯。
 *
 * 實際遞迴邏輯在 ../shared/walk-block-tree.ts 的 walkBlockTree()，這裡
 * 只是把 JSX 語法策略（jsxSyntax）與這個 options 型別套進去。
 */
export function walkBlockListToSplitJsx(
  blocks: AnyPageNode[],
  options: RenderBlockTreeToSplitJsxOptions,
  indentLevel: number,
): SplitJsxWalkResult {
  const result = walkBlockTree(blocks, options, jsxSyntax, indentLevel);
  return { jsx: result.template, dataExports: result.dataExports, isEmpty: result.isEmpty };
}

// 保留匯出，方便其他檔案需要單獨引用縮排單位（目前無呼叫端，維持相容）。
export { INDENT_UNIT };
