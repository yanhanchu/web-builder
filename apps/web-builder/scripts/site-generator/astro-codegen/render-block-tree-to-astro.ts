// ============================================================
// render-block-tree-to-astro —— 把 PageBlock 樹轉成「Astro template 片段 +
// 拆開的資料 export」兩部分，對照 jsx-codegen/render-block-tree-to-split-jsx.ts
// 的 React 版本，差異只在：
//
//   1. 產出的是 Astro component 語法（`<Hero {...hero} />`），不是 JSX，但
//      寫法幾乎一樣——Astro template 本來就允許 `{...obj}` spread 語法。
//   2. 每個 PageBlock 若帶有 `clientDirective`（見 page-model/index.ts），
//      要在標籤上加對應的 `client:*` 屬性（例如 `client:only="react"`、
//      `client:visible`）。這是 React 版完全沒有的概念——React SPA 本來就是
//      全站水合，Astro 預設是零 JS，需要明確標記哪些組件要被 hydrate。
//   3. `client:media` 目前資料模型（ClientDirective 型別）只存了種類本身，
//      沒有額外存 media query 字串，所以先輸出 `client:media="(min-width: 768px)"`
//      這種佔位值，並在標籤正上方補一行 HTML 註解提醒「需要之後手動調整」，
//      避免產生無效語法（Astro 標籤的屬性列本身不能塞 JSX 專屬的
//      `{/* ... */}` 註解語法）。
//   4. `children` 若被使用者塞成純值（例如數字、字串，不是子 block），會
//      跟其他純值 props 一起被 spread 進 `{...button2}`（例如
//      `<Button {...button2} />`），畫面上不會渲染出來——`children` prop
//      跟真正的 JSX/Astro children（標籤之間的內容）是兩回事，組件多半是
//      靠後者渲染。這裡改成把它從 spread 物件裡「顯式」拉出來，用
//      `{button2.children}` 表達式當作標籤之間的 children 插入，輸出成
//      單行 `<Button {...button2}>{button2.children}</Button>`（不像巢狀
//      block children 那樣換行展開）。資料本身仍只有一份
//      （`button2.children`），不重複字面量。
//
// 跟 React 版一樣：resolvePlainProps() 已經把 i18n 綁定欄位 resolve 成純
// 值，這裡不含任何 i18n/resolve 邏輯，純粹是 tree -> template 字串組裝。
//
// 遞迴走訪 block 樹、resolve SharedBlockRef、拆 slot/plain props、抽
// DataExport 這些邏輯跟 jsx-codegen 完全共用，實作在
// ../shared/walk-block-tree.ts，這裡只提供 Astro 特有的語法（client:*
// 屬性、Fragment 寫法、HTML 註解、純值 children 拉出寫法）。
// ============================================================

import type { DataStore } from "../../../src/lib/data-model/schema";
import type { AnyPageNode, ClientDirective, PageBlock, SharedBlockDefinition } from "../../../src/lib/page-model";
import type { ImportCollector } from "../shared/import-collector";
import { walkBlockTree, INDENT_UNIT, type WalkSyntax } from "../shared/walk-block-tree";
import type { VarNameAllocator } from "../shared/var-naming";
import type { DataExport } from "../shared/data-export";

export interface RenderBlockTreeToAstroOptions {
  locale: string;
  /** 站台預設語系，見 render-block-tree-to-split-jsx.ts 同名欄位說明。 */
  defaultLocale: string;
  store: DataStore;
  /**
   * 共用區塊定義查表（key 為 SharedBlockDefinition.id，來自
   * loadStaticData() 回傳的 sharedBlocks 陣列組成的 map），用來把樹裡的
   * SharedBlockRef 節點 resolve 成等效的 PageBlock——跟畫布渲染
   * （site-renderer/render-block-tree.tsx）、另一套 codegen
   * （jsx-codegen）共用同一份 page-model 的 resolveSharedBlockRef 邏輯。
   * 沒有任何 SharedBlockRef 的樹可以傳空物件 `{}`。
   */
  definitions: Record<string, SharedBlockDefinition>;
  /** 收集這個 block 樹用到的所有「組件」import（`@workspace/ui/...`）。 */
  componentImports: ImportCollector;
  /** 幫每個 block 配一個資料變數名稱，同一份 allocator 內保證唯一。 */
  varNames: VarNameAllocator;
  onWarning?: (message: string) => void;
}

export interface AstroNodeResult {
  /** 這個 block（含巢狀 slot 底下所有子 block）走訪出來的 Astro template 片段。 */
  template: string;
  /** 走訪過程中抽出的所有資料 export（含巢狀 slot 子節點的），依走訪順序排列。 */
  dataExports: DataExport[];
}

export interface AstroWalkResult extends AstroNodeResult {
  /** 這次走訪的是空陣列（頁面完全沒有任何頂層 block）。見 render-page-astro.ts。 */
  isEmpty: boolean;
}

/**
 * ClientDirective -> Astro `client:*` 屬性原始碼片段（含前導空白，方便直接
 * 接在其他屬性後面）。React 元件在 Astro 裡預設是純 SSR（不帶任何
 * client:* 指令）；只有明確設定過 clientDirective 的 block 才需要 hydrate，
 * 這對應「零 JS by default，island 顯式加註」的 Astro 慣例。
 *
 * 所有 island 都假設是 React 組件（`@workspace/ui` 底下目前只有 React
 * 實作），所以 client:* 屬性統一標 `="react"` 這個 renderer 提示——Astro
 * 的 client:only 需要指定 renderer 名稱（`client:only="react"`），其餘
 * directive（visible/idle/load）不需要值，這裡維持原樣不加 renderer 提示。
 */
function clientDirectiveAttr(directive: ClientDirective | undefined): string {
  switch (directive) {
    case undefined:
      return "";
    case "only":
      return ' client:only="react"';
    case "visible":
      return " client:visible";
    case "idle":
      return " client:idle";
    case "load":
      return " client:load";
    case "media":
      // ClientDirective 目前只存種類，没有額外存 media query 字串（見
      // page-model/index.ts ClientDirective 型別），這裡先給一個常見的
      // 佔位斷點。walkTemplate 另外會在這個 block 對應的標籤正上方插入一
      // 行 HTML 註解提醒之後要手動調整 media query——不能直接把註解塞進
      // 屬性列本身（Astro 標籤屬性不支援 `{/* ... */}` 這種 JSX 專屬語法，
      // 那樣會是無效語法）。
      return ' client:media="(min-width: 768px)"';
    default:
      return "";
  }
}

/** Astro 特有語法：`<Fragment>` 、HTML 註解、client:* 屬性、純值 children 顯式拉出。 */
const astroSyntax: WalkSyntax = {
  missingComponentComment: (pad, componentId) => `${pad}<!-- 找不到組件定義：${componentId} -->`,
  fragmentOpenTag: "<Fragment>",
  fragmentCloseTag: "</Fragment>",
  openTag: (componentName, attrLines, singleLineAttr, pad, block) => {
    const directiveAttr = clientDirectiveAttr(block.clientDirective);
    if (attrLines.length === 0) return `<${componentName}${directiveAttr}>`;
    if (singleLineAttr !== null) return `<${componentName} ${singleLineAttr}${directiveAttr}>`;
    return `<${componentName}\n${attrLines.join("\n")}${directiveAttr}\n${pad}>`;
  },
  selfClosingTag: (componentName, attrLines, singleLineAttr, pad, block) => {
    const directiveAttr = clientDirectiveAttr(block.clientDirective);
    if (attrLines.length === 0) return `<${componentName}${directiveAttr} />`;
    if (singleLineAttr !== null) return `<${componentName} ${singleLineAttr}${directiveAttr} />`;
    return `<${componentName}\n${attrLines.join("\n")}${directiveAttr}\n${pad}/>`;
  },
  // "children" 若被使用者塞成純值（例如數字、字串，而不是子 block），會
  // 留在 resolvedProps 裡，因此也會被 spread 進 `{...button2}`。但 spread
  // 只會把 `children` 設成 prop（`<Button children={999} />`），组件實際
  // 上多半是拿模板 children（`props.children`）渲染，所以這裡把它從
  // spread 物件的陰影裡「顯式」拉出來，用 `{varName.children}` 當作真正的
  // Astro children 插入標籤之間——資料本身仍只有一份，這裡只是換了個位置
  // 引用，不重複字面量。
  formatPlainChildrenExpr: (spreadVarName) => `{${spreadVarName}.children}`,
  // client:media 目前只能給一個佔位 media query（見 clientDirectiveAttr()
  // 的說明），在標籤正上方補一行 HTML 註解提醒之後要手動調整——這裡用
  // 普通 HTML 註解（Astro template 語法支援），適用於標籤屬性列以外的
  // 任何位置。
  wrapTemplate: (template, pad, block: PageBlock) =>
    block.clientDirective === "media" ? `${pad}<!-- TODO: 調整下面 client:media 的 media query -->\n${template}` : template,
};

/**
 * 遞迴把單一 block 轉成「Astro template 片段 + 資料 export 清單」。
 * indentLevel：這個節點的起始縮排層級。
 *
 * SharedBlockRef 節點會先用 resolveSharedBlockRef() 展開成等效的
 * PageBlock 再繼續走原本邏輯（跟畫布渲染共用同一份 page-model 邏輯，不在
 * 這裡另外發明一套）。找不到對應的 SharedBlockDefinition 時直接拋出明確
 * 錯誤中止整個生成——生成器產出的是最終網站，引用失效不該悄悄漏產出一塊
 * 內容，不像畫布渲染那樣可以顯示錯誤狀態後讓使用者繼續編輯。
 *
 * 實際遞迴邏輯在 ../shared/walk-block-tree.ts 的 walkBlockTree()，這裡
 * 只是把 Astro 語法策略（astroSyntax）與這個 options 型別套進去。
 */
export function walkBlockListToAstro(
  blocks: AnyPageNode[],
  options: RenderBlockTreeToAstroOptions,
  indentLevel: number,
): AstroWalkResult {
  const result = walkBlockTree(blocks, options, astroSyntax, indentLevel);
  return { template: result.template, dataExports: result.dataExports, isEmpty: result.isEmpty };
}

export { INDENT_UNIT };
