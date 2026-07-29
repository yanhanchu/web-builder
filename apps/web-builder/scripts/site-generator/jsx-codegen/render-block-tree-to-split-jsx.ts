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
// ============================================================

import type { DataStore } from "../../../src/lib/data-model/schema";
import { componentPropsRegistry } from "../../../src/lib/data-model/from-generated";
import { getComponentById } from "../../../src/lib/generator/component-registry";
import { isSlotPropType, splitSlotProps, type PageBlock } from "../../../src/lib/page-model";
import { resolvePlainProps } from "../../../src/lib/site-renderer/resolve-props";
import { ImportCollector, toWorkspaceImportPath } from "./import-collector";
import { VarNameAllocator } from "./var-naming";

export interface RenderBlockTreeToSplitJsxOptions {
  locale: string;
  /**
   * 站台的預設語系，透過 resolvePlainProps -> resolveValue 傳給
   * ResolveContext.defaultLocale，用來決定「綁定到站內頁面（route
   * target=page）的值」要不要加上 locale 前綴（見 schema.ts 說明）。
   */
  defaultLocale: string;
  store: DataStore;
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

/** 一筆被抽出來的資料 export：某個 block 的純值 props，等著被寫進某個資料檔案。 */
export interface DataExport {
  /** 這筆資料的變數名稱（camelCase，例如 "hero"），也是 export 出去的具名匯出名稱。 */
  varName: string;
  /** 來源組件名稱（PascalCase，例如 "Hero"），方便資料檔案加註解對照。 */
  componentName: string;
  /** 這個 block 對應的組件 props 型別名稱（PascalCase + "Props"，例如 "HeroProps"），用來幫資料檔案的 export 標型別註記，跟 default.ts 手寫慣例一致。找不到型別定義時為 undefined（不標型別，仍是合法程式碼，只是少了型別檢查）。 */
  propsTypeName?: string;
  /** 型別所在模組的 import 路徑（`@workspace/ui/components/...`，跟組件本身同一個檔案），資料檔案需要 import 這個路徑才能標型別註記，不會出現「型別名稱有寫但沒 import」的無效程式碼。 */
  propsTypeImportPath: string;
  /** resolved 純值（resolveValue 的輸出），呼叫端用 stringify-literal.ts 轉成程式碼字串。 */
  value: Record<string, unknown>;
  /**
   * 這個組件的 props 型別中，屬於 ReactNode（例如 "children"、"icon"）
   * 且這次「真的沒有出現在 `value` 裡」的欄位名稱——即型別是 ReactNode
   * （isSlotPropType()）與「不在 value 裡」兩個條件的交集。
   *
   * 之所以要交集而不是只看型別：ReactNode 型別的 prop 不代表這次一定被
   * 拆成巢狀 JSX，使用者也可能直接塞純字串當 children（例如
   * `<Button>test</Button>`），這種情況 "children" 會留在 `value` 裡，若
   * 仍列進 omittedPropKeys 會變成 Omit 掉一個其實有值的欄位，反而多了
   * 型別上不存在的屬性而報錯。標型別註記時要用
   * `Omit<XxxProps, "key1" | "key2">` 排除掉真的缺少的欄位，否則會少了
   * 必填欄位而型別錯誤。
   */
  omittedPropKeys: string[];
}

const INDENT_UNIT = "  ";

/** 把一個 block 的 resolved props 組成一個 DataExport（並登記進 varNames allocator）。 */
function toDataExport(
  componentName: string,
  componentImportPath: string,
  resolvedProps: Record<string, unknown>,
  varNames: VarNameAllocator,
  omittedPropKeys: string[],
): DataExport {
  const varName = varNames.allocate(componentName);
  // props 型別名稱慣例：ComponentDoc.id 是 "{filePath}#{componentName}"，
  // 型別檔案（generator）沒有直接提供「這個組件的 props 型別名稱」欄位，
  // 但專案慣例（見 default.ts）固定是 `${componentName}Props`，這裡直接照
  // 這個慣例組出來，不去反查 component-types.json（型別是否真的存在由
  // TypeScript 編譯期檢查，這裡只是盡量產出貼近手寫慣例的型別註記）。
  const propsTypeName = `${componentName}Props`;
  return {
    varName,
    componentName,
    propsTypeName,
    propsTypeImportPath: componentImportPath,
    value: resolvedProps,
    omittedPropKeys,
  };
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
   * 顯式的 null 節點。單一節點（walkNode）不會是空陣列，這個旗標只在
   * 「整個頁面的 blocks 陣列」這一層才有意義。
   */
  isEmpty: boolean;
}

/**
 * 遞迴把單一 block 轉成「JSX 片段 + 資料 export 清單」。
 * indentLevel：這個節點的起始縮排層級。
 */
function walkNode(
  block: PageBlock,
  options: RenderBlockTreeToSplitJsxOptions,
  indentLevel: number,
): SplitJsxNodeResult {
  const pad = INDENT_UNIT.repeat(indentLevel);
  const component = getComponentById(block.componentId);

  if (!component) {
    options.onWarning?.(`找不到組件定義（componentId: ${block.componentId}），已略過`);
    return { jsx: `${pad}{/* 找不到組件定義：${block.componentId} */}`, dataExports: [] };
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
    // 巢狀 JSX——如果使用者在這個 block 上把 "children" 設成純字串（而不是
    // 塞進子組件），splitSlotProps() 就會把它歸進 plainProps，最後出現在
    // resolvedProps（也就是 value）裡（例如 <Button>children: "test"</Button>
    // 這種「children 當文字內容用」的情境，ReactNode 本來就允許塞字串）。
    //
    // 所以只有「型別是 ReactNode，而且這次真的沒有出現在 resolvedProps
    // 裡」的欄位才需要 Omit：只看型別會誤刪掉「值裡其實有這個 key」的
    // 情況（型別錯誤：多了型別上不存在的屬性）；只看執行期 slotProps 又會
    // 漏掉「型別是 ReactNode 但這次剛好沒有任何子節點」的情況（見前一版
    // 註解）。兩者取交集才對得起實際輸出的 value 內容。
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

  // "children" 是 ReactNode slot（例如 <Layout>...</Layout> 的巢狀內容），
  // 要渲染成真正的 JSX children，不能像其他 slot 一樣寫成 children={...}
  // attribute——後者雖然合法，但不是慣用寫法，也會多一層不必要的巢狀。
  const { children: childrenSlot, ...namedSlotProps } = slotProps;

  // 其餘具名 slot props（子組件陣列）遞迴走訪：結構維持巢狀 JSX，子節點自己的資料 export 併入同一份清單。
  const slotAttrLines: string[] = [];
  for (const [key, children] of Object.entries(namedSlotProps)) {
    if (children.length === 0) {
      slotAttrLines.push(`${INDENT_UNIT.repeat(indentLevel + 1)}${key}={null}`);
      continue;
    }
    if (children.length === 1) {
      const childResult = walkNode(children[0], options, indentLevel + 2);
      dataExports.push(...childResult.dataExports);
      slotAttrLines.push(
        `${INDENT_UNIT.repeat(indentLevel + 1)}${key}={\n${childResult.jsx}\n${INDENT_UNIT.repeat(indentLevel + 1)}}`,
      );
      continue;
    }
    // slot attribute 底下有多個子節點時仍需要 <>...</> 包起來，因為
    // attribute 只能接受單一 expression（跟直接當 JSX children 不同）。
    const childResults = children.map((child) => walkNode(child, options, indentLevel + 2));
    for (const r of childResults) dataExports.push(...r.dataExports);
    const childLines = childResults.map((r) => r.jsx).join("\n");
    slotAttrLines.push(
      `${INDENT_UNIT.repeat(indentLevel + 1)}${key}={\n` +
        `${INDENT_UNIT.repeat(indentLevel + 2)}<>\n${childLines}\n${INDENT_UNIT.repeat(indentLevel + 2)}</>\n` +
        `${INDENT_UNIT.repeat(indentLevel + 1)}}`,
    );
  }

  const spreadAttr = spreadVarName ? `{...${spreadVarName}}` : null;
  const allAttrLines = [spreadAttr ? `${INDENT_UNIT.repeat(indentLevel + 1)}${spreadAttr}` : null, ...slotAttrLines].filter(
    (l): l is string => l !== null,
  );

  // children slot 走訪：直接當成 JSX children 放在開合標籤之間，不需要
  // <>...</> 包起來——JSX children 位置本來就可以放多個相鄰節點。
  let childrenJsx: string | null = null;
  if (childrenSlot && childrenSlot.length > 0) {
    const childResults = childrenSlot.map((child) => walkNode(child, options, indentLevel + 1));
    for (const r of childResults) dataExports.push(...r.dataExports);
    childrenJsx = childResults.map((r) => r.jsx).join("\n");
  }

  // 開始標籤：屬性能單行放下（只有 spread、沒有具名 slot attribute）就
  // 收成一行，減少不必要的換行；有多個 attribute（例如具名 slot）才逐行展開。
  const singleLineAttr = spreadAttr && slotAttrLines.length === 0 ? ` ${spreadAttr}` : null;
  const openTag =
    allAttrLines.length === 0
      ? `<${component.componentName}>`
      : singleLineAttr !== null
        ? `<${component.componentName}${singleLineAttr}>`
        : `<${component.componentName}\n${allAttrLines.join("\n")}\n${pad}>`;
  const selfClosingTag =
    allAttrLines.length === 0
      ? `<${component.componentName} />`
      : singleLineAttr !== null
        ? `<${component.componentName}${singleLineAttr} />`
        : `<${component.componentName}\n${allAttrLines.join("\n")}\n${pad}/>`;

  const jsx =
    childrenJsx === null
      ? `${pad}${selfClosingTag}`
      : `${pad}${openTag}\n${childrenJsx}\n${pad}</${component.componentName}>`;

  return { jsx, dataExports };
}

/** 把整個 blocks 陣列（頁面內容區的頂層組件清單）走訪成「JSX 片段 + 資料 export 清單」。 */
export function walkBlockListToSplitJsx(
  blocks: PageBlock[],
  options: RenderBlockTreeToSplitJsxOptions,
  indentLevel: number,
): SplitJsxWalkResult {
  if (blocks.length === 0) return { jsx: "", dataExports: [], isEmpty: true };
  const results = blocks.map((block) => walkNode(block, options, indentLevel));
  return {
    jsx: results.map((r) => r.jsx).join("\n"),
    dataExports: results.flatMap((r) => r.dataExports),
    isEmpty: false,
  };
}