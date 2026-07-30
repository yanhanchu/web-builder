// ============================================================
// walk-block-tree —— 兩套 codegen（astro-codegen / jsx-codegen）共用的
// 「遞迴走訪 PageBlock 樹，組成『模板片段 + 資料 export 清單』」核心邏輯。
//
// 兩邊原本各自實作一份幾乎一模一樣的 walkNode()：resolve SharedBlockRef、
// 找組件定義、拆 slot/plain props、resolve i18n 綁定、把純值 props 抽成
// DataExport、遞迴處理具名 slot 與 children slot、組開合標籤與屬性列……
// 這些邏輯跟輸出語法（JSX 或 Astro template）本身無關，只有下面幾點
// 兩邊不同，抽成 `WalkSyntax` 策略物件由呼叫端（各自的 codegen）提供：
//
//   1. Astro 需要在標籤上加 `client:*` 屬性（clientDirective），JSX 沒有
//      這個概念（React SPA 全站水合）。
//   2. 具名 slot 底下有多個子節點時要包一層 fragment：JSX 用 `<>...</>`，
//      Astro 用 `<Fragment>...</Fragment>`（Astro template 沒有 `<>`
//      簡寫語法）。
//   3. 找不到組件定義時的警告註解語法：JSX 用 `{/* ... */}`，Astro 用
//      `<!-- ... -->`。
//   4. Astro 版多了一段「children 若是純值（例如數字、字串），改成
//      `{varName.children}` 表達式插入標籤之間」的處理（見
//      astro-codegen 呼叫端註解），JSX 版目前沒有這個情境（純值
//      children 就留在 spread 物件裡即可，JSX 本身沒有 Astro 那種
//      attribute 列限制）。這段由 `formatPlainChildrenExpr` 選填 hook
//      決定要不要啟用，不提供時維持 JSX 原本的行為（純值 children 不特別
//      拉出來）。
//
// 除此之外的邏輯（resolve SharedBlockRef、找組件、拆 props、遞迴 slot、
// 組 DataExport）完全共用，只寫一份，兩邊都呼叫這裡的 walkBlockTree()。
// ============================================================

import type { DataStore } from "../../../src/lib/data-model/schema";
import { componentPropsRegistry } from "../../../src/lib/data-model/from-generated";
import { getComponentById } from "../../../src/lib/generator/component-registry";
import {
  isSharedBlockRef,
  isSlotPropType,
  resolveSharedBlockRef,
  splitSlotProps,
  type AnyPageNode,
  type PageBlock,
  type SharedBlockDefinition,
} from "../../../src/lib/page-model";
import { resolvePlainProps } from "../../../src/lib/site-renderer/resolve-props";
import { toWorkspaceImportPath, type ImportCollector } from "./import-collector";
import { toDataExport, type DataExport } from "./data-export";
import type { VarNameAllocator } from "./var-naming";

export const INDENT_UNIT = "  ";

export interface WalkBlockTreeOptions {
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
   * （site-renderer/render-block-tree.tsx）、另一套 codegen共用同一份
   * page-model 的 resolveSharedBlockRef 邏輯。沒有任何 SharedBlockRef
   * 的樹可以傳空物件 `{}`。
   */
  definitions: Record<string, SharedBlockDefinition>;
  /** 收集這個 block 樹用到的所有「組件」import（`@workspace/ui/...`）。 */
  componentImports: ImportCollector;
  /** 幫每個 block 配一個資料變數名稱，同一份 allocator 內保證唯一。 */
  varNames: VarNameAllocator;
  onWarning?: (message: string) => void;
}

export interface WalkNodeResult {
  /** 這個 block（含巢狀 slot 底下所有子 block）走訪出來的模板片段。 */
  template: string;
  /** 走訪過程中抽出的所有資料 export（含巢狀 slot 子節點的），依走訪順序排列。 */
  dataExports: DataExport[];
}

export interface WalkListResult extends WalkNodeResult {
  /** 這次走訪的是空陣列（頁面完全沒有任何頂層 block）。呼叫端用這個旗標決定要不要產生空頁面的佔位輸出。 */
  isEmpty: boolean;
}

/**
 * 兩套 codegen 語法差異策略。每個方法只處理「輸出語法長什麼樣子」，不含
 * 任何 tree-walk / resolve / props 拆分邏輯（那些留在 walkBlockTree 本體）。
 */
export interface WalkSyntax {
  /** 找不到組件定義時的警告輸出（整行，含縮排）。 */
  missingComponentComment(pad: string, componentId: string): string;
  /** 具名 slot 底下多個子節點時，包住這些子節點的 fragment 開始/結束標籤。 */
  fragmentOpenTag: string;
  fragmentCloseTag: string;
  /**
   * 組出開始標籤／自我封閉標籤，attrLines 已含縮排（每行一個屬性），
   * singleLineAttr 是「可以跟標籤名同一行」的簡化版本（只有 spread、
   * 沒有具名 slot attribute 時才會有值）。
   */
  openTag(componentName: string, attrLines: string[], singleLineAttr: string | null, pad: string, block: PageBlock): string;
  selfClosingTag(
    componentName: string,
    attrLines: string[],
    singleLineAttr: string | null,
    pad: string,
    block: PageBlock,
  ): string;
  /**
   * 選填：把「純值 children（resolvedProps.children 是純字串/數字等，不是
   * 子 block）」轉成要插入標籤之間的表達式。不提供時，純值 children 維持
   * 原樣留在 spread 物件裡，不特別處理（JSX 版行為）。
   */
  formatPlainChildrenExpr?(spreadVarName: string): string;
  /** 選填：在 template 片段外面再包一層（例如 Astro 版的 client:media 提醒註解）。 */
  wrapTemplate?(template: string, pad: string, block: PageBlock): string;
}

/**
 * 遞迴把單一節點轉成「模板片段 + 資料 export 清單」。
 *
 * SharedBlockRef 節點會先用 resolveSharedBlockRef() 展開成等效的
 * PageBlock 再繼續走原本邏輯（跟畫布渲染、另一套 codegen 共用同一份
 * page-model 邏輯，不在這裡另外發明一套）。找不到對應的
 * SharedBlockDefinition 時直接拋出明確錯誤中止整個生成——生成器產出的是
 * 最終網站，引用失效不該悄悄漏產出一塊內容，不像畫布渲染那樣可以顯示錯誤
 * 狀態後讓使用者繼續編輯。
 */
function walkNode(
  node: AnyPageNode,
  options: WalkBlockTreeOptions,
  syntax: WalkSyntax,
  indentLevel: number,
): WalkNodeResult {
  const block = isSharedBlockRef(node) ? resolveSharedBlockRef(node, options.definitions) : node;
  if (!block) {
    // block 為 null 只會發生在 node 是 SharedBlockRef 但 resolve 失敗的情況
    // （node 是 PageBlock 時 block 一定等於 node 本身，不可能落到這裡）。
    const ref = node as Extract<AnyPageNode, { kind: "sharedBlockRef" }>;
    throw new Error(
      `共用區塊已遺失：找不到 id 為 "${ref.ref}" 的 SharedBlockDefinition（引用它的節點 instanceId: ${ref.instanceId}）`,
    );
  }

  const pad = INDENT_UNIT.repeat(indentLevel);
  const component = getComponentById(block.componentId);

  if (!component) {
    options.onWarning?.(`找不到組件定義（componentId: ${block.componentId}），已略過`);
    return { template: syntax.missingComponentComment(pad, block.componentId), dataExports: [] };
  }

  options.componentImports.add(toWorkspaceImportPath(component.importPath), component.componentName);

  const { plainProps, slotProps } = splitSlotProps(block);
  const propsFieldType = componentPropsRegistry[component.id]?.propsType;
  const resolvedProps = resolvePlainProps(
    plainProps,
    propsFieldType,
    options.store,
    options.locale,
    {},
    options.defaultLocale,
  );

  const dataExports: DataExport[] = [];
  // 沒有任何純值 props（例如純容器組件，全部都是 slot）時，不需要產生一筆
  // 空的資料 export；直接跳過 spread attribute。
  const hasPlainProps = Object.keys(resolvedProps).length > 0;
  let spreadVarName: string | undefined;
  if (hasPlainProps) {
    // 型別是 ReactNode 的 prop（例如 "children"、"icon"）不一定真的被拆成
    // 巢狀模板節點——如果使用者在這個 block 上把 "children" 設成純字串
    // （而不是塞進子組件），splitSlotProps() 就會把它歸進 plainProps，
    // 最後出現在 resolvedProps（也就是 value）裡。
    //
    // 所以只有「型別是 ReactNode，而且這次真的沒有出現在 resolvedProps
    // 裡」的欄位才需要 Omit：只看型別會誤刪掉「值裡其實有這個 key」的
    // 情況（型別錯誤：多了型別上不存在的屬性）；只看執行期 slotProps 又會
    // 漏掉「型別是 ReactNode 但這次剛好沒有任何子節點」的情況。兩者取
    // 交集才對得起實際輸出的 value 內容。
    const reactNodePropKeys = new Set(component.props.filter((p) => isSlotPropType(p.type)).map((p) => p.name));
    const omittedPropKeys = [...reactNodePropKeys].filter((key) => !(key in resolvedProps));
    const dataExport = toDataExport(
      component.componentName,
      toWorkspaceImportPath(component.importPath),
      resolvedProps,
      options.varNames,
      omittedPropKeys,
    );
    dataExports.push(dataExport);
    spreadVarName = dataExport.varName;
  }

  // 純值 children（見 formatPlainChildrenExpr 說明）：只有 Astro 版需要
  // 把它從 spread 物件裡「顯式」拉出來當標籤之間的 children；JSX 版
  // 不提供這個 hook，維持原樣留在 spread 物件裡。
  const hasPlainChildren = hasPlainProps && spreadVarName !== undefined && "children" in resolvedProps;
  const plainChildrenExpr =
    hasPlainChildren && syntax.formatPlainChildrenExpr ? syntax.formatPlainChildrenExpr(spreadVarName!) : null;

  // "children" 是 ReactNode slot（例如 <Layout>...</Layout> 的巢狀內容），
  // 要渲染成真正的模板 children，不能像其他 slot 一樣寫成 children={...}
  // attribute——後者雖然合法，但不是慣用寫法，也會多一層不必要的巢狀。
  const { children: childrenSlot, ...namedSlotProps } = slotProps;

  // 其餘具名 slot props（子組件陣列）遞迴走訪：結構維持巢狀模板節點，子節點自己的資料 export 併入同一份清單。
  const slotAttrLines: string[] = [];
  for (const [key, children] of Object.entries(namedSlotProps)) {
    if (children.length === 0) {
      slotAttrLines.push(`${INDENT_UNIT.repeat(indentLevel + 1)}${key}={null}`);
      continue;
    }
    if (children.length === 1) {
      const childResult = walkNode(children[0], options, syntax, indentLevel + 2);
      dataExports.push(...childResult.dataExports);
      slotAttrLines.push(
        `${INDENT_UNIT.repeat(indentLevel + 1)}${key}={\n${childResult.template}\n${INDENT_UNIT.repeat(indentLevel + 1)}}`,
      );
      continue;
    }
    // slot attribute 底下有多個子節點時仍需要 fragment 包起來，因為
    // attribute 只能接受單一 expression（跟直接當模板 children 不同）。
    const childResults = children.map((child) => walkNode(child, options, syntax, indentLevel + 2));
    for (const r of childResults) dataExports.push(...r.dataExports);
    const childLines = childResults.map((r) => r.template).join("\n");
    slotAttrLines.push(
      `${INDENT_UNIT.repeat(indentLevel + 1)}${key}={\n` +
        `${INDENT_UNIT.repeat(indentLevel + 2)}${syntax.fragmentOpenTag}\n${childLines}\n${INDENT_UNIT.repeat(indentLevel + 2)}${syntax.fragmentCloseTag}\n` +
        `${INDENT_UNIT.repeat(indentLevel + 1)}}`,
    );
  }

  const spreadAttr = spreadVarName ? `{...${spreadVarName}}` : null;
  const allAttrLines = [spreadAttr ? `${INDENT_UNIT.repeat(indentLevel + 1)}${spreadAttr}` : null, ...slotAttrLines].filter(
    (l): l is string => l !== null,
  );

  // children slot 走訪：直接當成模板 children 放在開合標籤之間，不需要
  // fragment 包起來——模板 children 位置本來就可以放多個相鄰節點。
  let childrenTemplate: string | null = null;
  let childrenIsPlainInline = false;
  if (childrenSlot && childrenSlot.length > 0) {
    const childResults = childrenSlot.map((child) => walkNode(child, options, syntax, indentLevel + 1));
    for (const r of childResults) dataExports.push(...r.dataExports);
    childrenTemplate = childResults.map((r) => r.template).join("\n");
  } else if (plainChildrenExpr !== null) {
    // 沒有真正的子 block（childrenSlot 為空），但 resolvedProps 裡有純值
    // children，改用 syntax.formatPlainChildrenExpr 組好的表達式當
    // children——跟巢狀 block 不同，這裡只是單一個表達式，不需要另起一行、
    // 也不需要縮排，直接跟開合標籤同一行即可。
    childrenTemplate = plainChildrenExpr;
    childrenIsPlainInline = true;
  }

  // 開始標籤：屬性能單行放下（只有 spread、沒有具名 slot attribute）就
  // 收成一行，減少不必要的換行；有多個 attribute（例如具名 slot）才逐行展開。
  const singleLineAttr = spreadAttr && slotAttrLines.length === 0 ? spreadAttr : null;
  const openTag = syntax.openTag(component.componentName, allAttrLines, singleLineAttr, pad, block);
  const selfClosingTag = syntax.selfClosingTag(component.componentName, allAttrLines, singleLineAttr, pad, block);

  const template =
    childrenTemplate === null
      ? `${pad}${selfClosingTag}`
      : childrenIsPlainInline
        ? `${pad}${openTag}${childrenTemplate}</${component.componentName}>`
        : `${pad}${openTag}\n${childrenTemplate}\n${pad}</${component.componentName}>`;

  return { template: syntax.wrapTemplate ? syntax.wrapTemplate(template, pad, block) : template, dataExports };
}

/** 把整個 blocks 陣列（頁面內容區的頂層組件清單）走訪成「模板片段 + 資料 export 清單」。 */
export function walkBlockTree(
  blocks: AnyPageNode[],
  options: WalkBlockTreeOptions,
  syntax: WalkSyntax,
  indentLevel: number,
): WalkListResult {
  if (blocks.length === 0) return { template: "", dataExports: [], isEmpty: true };
  const results = blocks.map((block) => walkNode(block, options, syntax, indentLevel));
  return {
    template: results.map((r) => r.template).join("\n"),
    dataExports: results.flatMap((r) => r.dataExports),
    isEmpty: false,
  };
}

export type { DataExport };
