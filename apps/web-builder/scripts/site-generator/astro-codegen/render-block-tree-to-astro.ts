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
//
// 跟 React 版一樣：resolvePlainProps() 已經把 i18n 綁定欄位 resolve 成純
// 值，這裡不含任何 i18n/resolve 邏輯，純粹是 tree -> template 字串組裝。
// ============================================================

import type { DataStore } from "../../../src/lib/data-model/schema";
import { componentPropsRegistry } from "../../../src/lib/data-model/from-generated";
import { getComponentById } from "../../../src/lib/generator/component-registry";
import { isSlotPropType, splitSlotProps, type ClientDirective, type PageBlock } from "../../../src/lib/page-model";
import { resolvePlainProps } from "../../../src/lib/site-renderer/resolve-props";
import { ImportCollector, toWorkspaceImportPath } from "../jsx-codegen/import-collector";
import { VarNameAllocator } from "../jsx-codegen/var-naming";
import type { DataExport } from "../jsx-codegen/render-block-tree-to-split-jsx";

export interface RenderBlockTreeToAstroOptions {
  locale: string;
  /** 站台預設語系，見 render-block-tree-to-split-jsx.ts 同名欄位說明。 */
  defaultLocale: string;
  store: DataStore;
  /** 收集這個 block 樹用到的所有「組件」import（`@workspace/ui/...`）。 */
  componentImports: ImportCollector;
  /** 幫每個 block 配一個資料變數名稱，同一份 allocator 內保證唯一。 */
  varNames: VarNameAllocator;
  onWarning?: (message: string) => void;
}

const INDENT_UNIT = "  ";

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
      // 佔位斷點。呼叫端（walkNode）另外會在這個 block 對應的標籤正上方
      // 插入一行 HTML 註解提醒之後要手動調整 media query——不能直接把
      // 註解塞進屬性列本身（Astro 標籤屬性不支援 `{/* ... */}` 這種 JSX
      // 專屬語法，那樣會是無效語法）。
      return ' client:media="(min-width: 768px)"';
    default:
      return "";
  }
}

/** 把一個 block 的 resolved props 組成一個 DataExport（並登記進 varNames allocator）。 */
function toDataExport(
  componentName: string,
  componentImportPath: string,
  resolvedProps: Record<string, unknown>,
  varNames: VarNameAllocator,
  omittedPropKeys: string[],
): DataExport {
  const varName = varNames.allocate(componentName);
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
 * 遞迴把單一 block 轉成「Astro template 片段 + 資料 export 清單」。
 * indentLevel：這個節點的起始縮排層級。
 */
function walkNode(block: PageBlock, options: RenderBlockTreeToAstroOptions, indentLevel: number): AstroNodeResult {
  const pad = INDENT_UNIT.repeat(indentLevel);
  const component = getComponentById(block.componentId);

  if (!component) {
    options.onWarning?.(`找不到組件定義（componentId: ${block.componentId}），已略過`);
    return { template: `${pad}<!-- 找不到組件定義：${block.componentId} -->`, dataExports: [] };
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
  const hasPlainProps = Object.keys(resolvedProps).length > 0;
  let spreadVarName: string | undefined;
  if (hasPlainProps) {
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

  const { children: childrenSlot, ...namedSlotProps } = slotProps;

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
        `${INDENT_UNIT.repeat(indentLevel + 1)}${key}={\n${childResult.template}\n${INDENT_UNIT.repeat(indentLevel + 1)}}`,
      );
      continue;
    }
    const childResults = children.map((child) => walkNode(child, options, indentLevel + 2));
    for (const r of childResults) dataExports.push(...r.dataExports);
    const childLines = childResults.map((r) => r.template).join("\n");
    slotAttrLines.push(
      `${INDENT_UNIT.repeat(indentLevel + 1)}${key}={\n` +
        `${INDENT_UNIT.repeat(indentLevel + 2)}<Fragment>\n${childLines}\n${INDENT_UNIT.repeat(indentLevel + 2)}</Fragment>\n` +
        `${INDENT_UNIT.repeat(indentLevel + 1)}}`,
    );
  }

  const spreadAttr = spreadVarName ? `{...${spreadVarName}}` : null;
  const directiveAttr = clientDirectiveAttr(block.clientDirective);
  const allAttrLines = [spreadAttr ? `${INDENT_UNIT.repeat(indentLevel + 1)}${spreadAttr}` : null, ...slotAttrLines].filter(
    (l): l is string => l !== null,
  );

  let childrenTemplate: string | null = null;
  if (childrenSlot && childrenSlot.length > 0) {
    const childResults = childrenSlot.map((child) => walkNode(child, options, indentLevel + 1));
    for (const r of childResults) dataExports.push(...r.dataExports);
    childrenTemplate = childResults.map((r) => r.template).join("\n");
  }

  // 屬性能單行放下（只有 spread + client 指令、沒有具名 slot attribute）就
  // 收成一行；有多個 attribute（例如具名 slot）才逐行展開。client:* 屬性
  // 一律接在最後（跟 spread 同一行或緊接在 allAttrLines 最後一行後面）。
  const singleLineAttr =
    spreadAttr && slotAttrLines.length === 0 ? ` ${spreadAttr}${directiveAttr}` : null;
  const openTag =
    allAttrLines.length === 0
      ? `<${component.componentName}${directiveAttr}>`
      : singleLineAttr !== null
        ? `<${component.componentName}${singleLineAttr}>`
        : `<${component.componentName}\n${allAttrLines.join("\n")}${directiveAttr}\n${pad}>`;
  const selfClosingTag =
    allAttrLines.length === 0
      ? `<${component.componentName}${directiveAttr} />`
      : singleLineAttr !== null
        ? `<${component.componentName}${singleLineAttr} />`
        : `<${component.componentName}\n${allAttrLines.join("\n")}${directiveAttr}\n${pad}/>`;

  const template =
    childrenTemplate === null
      ? `${pad}${selfClosingTag}`
      : `${pad}${openTag}\n${childrenTemplate}\n${pad}</${component.componentName}>`;

  // client:media 目前只能給一個佔位 media query（見 clientDirectiveAttr()
  // 的說明），在標籤正上方補一行 HTML 註解提醒之後要手動調整——這裡用
  // 普通 HTML 註解（Astro template 語法支援），不是 JSX 專屬的
  // `{/* ... */}`，適用於標籤屬性列以外的任何位置。
  const templateWithMediaNote =
    block.clientDirective === "media" ? `${pad}<!-- TODO: 調整下面 client:media 的 media query -->\n${template}` : template;

  return { template: templateWithMediaNote, dataExports };
}

/** 把整個 blocks 陣列（頁面內容區的頂層組件清單）走訪成「Astro template 片段 + 資料 export 清單」。 */
export function walkBlockListToAstro(
  blocks: PageBlock[],
  options: RenderBlockTreeToAstroOptions,
  indentLevel: number,
): AstroWalkResult {
  if (blocks.length === 0) return { template: "", dataExports: [], isEmpty: true };
  const results = blocks.map((block) => walkNode(block, options, indentLevel));
  return {
    template: results.map((r) => r.template).join("\n"),
    dataExports: results.flatMap((r) => r.dataExports),
    isEmpty: false,
  };
}
