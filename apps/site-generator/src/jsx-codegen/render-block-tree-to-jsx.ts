// ============================================================
// render-block-tree-to-jsx —— 把 PageBlock 樹轉成 JSX 原始碼文字
//
// 這是 roadmap.md 描述的 code generator，對應
// @workspace/ui/lib/site-renderer/render-block-tree.tsx 的
// renderBlockTreeSync，但輸出「原始碼字串」而不是「渲染結果」：
//
//   renderBlockTreeSync：block -> React.createElement(...) -> ReactNode
//   這個檔案：          block -> "<Hero title=\"...\" ... />" 這樣的字串
//
// locale 在產出當下就用 resolveValue() 解成純值，直接 dump 成 JSX
// attribute（字串 -> `prop="..."`；其餘 -> `prop={<表達式>}`），不會、也不
// 需要在 JSX 裡留著 i18n 綁定關係——這裡不做「瀏覽器裡動態切換 locale」，
// 每個輸出的 `.tsx` 檔案就是某個固定 locale 的靜態內容。
//   - slotProps 遞迴組出巢狀 JSX 並正確縮排
//   - import 語句自動收集、去重、排序（見 import-collector.ts）
// ============================================================

import type { DataStore } from "@workspace/ui/lib/data-model/schema";
import { componentPropsRegistry } from "@workspace/ui/lib/data-model/from-generated";
import { getComponentById } from "@workspace/ui/lib/generator/component-registry";
import { splitSlotProps, type PageBlock } from "@workspace/ui/lib/page-model";
import { resolvePlainProps } from "@workspace/ui/lib/site-renderer/resolve-props";
import { stringifyJsxAttrValue } from "./stringify-literal";
import { ImportCollector, toWorkspaceImportPath } from "./import-collector";

export interface RenderBlockTreeToJsxOptions {
  /** resolveValue 解析 i18n 綁定時要用的 locale——產出當下就固定死，輸出的 JSX 是這個 locale 的靜態內容。 */
  locale: string;
  store: DataStore;
  /** 收集這個 block 樹用到的所有組件 import；呼叫端負責最後 render() 成 import 語句。 */
  imports: ImportCollector;
  /**
   * 找不到組件定義 / 組件模組不存在時的替代文字（不做互動 fallback UI，
   * 只留一段註解說明原因，避免整個產生器中斷、又不會讓輸出的 .tsx 靜默錯誤）。
   */
  onWarning?: (message: string) => void;
}

const INDENT_UNIT = "  ";

/**
 * 把一個 block 的 resolved props 組成一組 JSX attribute 原始碼行（每個 prop
 * 一行，已含縮排，但不含結尾換行符），供呼叫端跟 slot attrs 的行陣列合併。
 * undefined 的 prop 直接省略（等同「沒有設定這個 prop」，跟真正組件的
 * default props 行為一致，也讓輸出的 JSX 更乾淨）。
 */
function renderAttrLines(
  resolvedProps: Record<string, unknown>,
  indentLevel: number,
): string[] {
  const pad = INDENT_UNIT.repeat(indentLevel);
  const lines: string[] = [];
  for (const [key, value] of Object.entries(resolvedProps)) {
    if (value === undefined) continue;
    const { needsBraces, source } = stringifyJsxAttrValue(value, indentLevel);
    lines.push(needsBraces ? `${pad}${key}={${source}}` : `${pad}${key}="${source}"`);
  }
  return lines;
}

/**
 * 遞迴把單一 block 轉成 JSX 原始碼字串（含巢狀 slot 子節點）。
 * indentLevel：這個節點的起始縮排層級（0 = 頁面內容區最外層）。
 */
function renderNode(
  block: PageBlock,
  options: RenderBlockTreeToJsxOptions,
  indentLevel: number,
): string {
  const pad = INDENT_UNIT.repeat(indentLevel);
  const component = getComponentById(block.componentId);

  if (!component) {
    options.onWarning?.(`找不到組件定義（componentId: ${block.componentId}），已略過`);
    return `${pad}{/* 找不到組件定義：${block.componentId} */}`;
  }

  options.imports.add(toWorkspaceImportPath(component.importPath), component.componentName);

  const { plainProps, slotProps } = splitSlotProps(block);
  const propsFieldType = componentPropsRegistry[component.id]?.propsType;
  const resolvedProps = resolvePlainProps(plainProps, propsFieldType, options.store, options.locale);

  // slot props（子組件陣列）不算進 resolvedProps 的純值，而是各自遞迴組出
  // 一段巢狀 JSX，插進對應 attribute 的位置。
  const slotAttrLines: string[] = [];
  for (const [key, children] of Object.entries(slotProps)) {
    if (children.length === 0) {
      slotAttrLines.push(`${INDENT_UNIT.repeat(indentLevel + 1)}${key}={null}`);
      continue;
    }
    if (children.length === 1) {
      // 單一子節點：直接內聯成 `slotProp={<Child ... />}`，避免不必要的 Fragment 包裝。
      const inline = renderNode(children[0], options, indentLevel + 2);
      slotAttrLines.push(
        `${INDENT_UNIT.repeat(indentLevel + 1)}${key}={\n${inline}\n${INDENT_UNIT.repeat(indentLevel + 1)}}`,
      );
      continue;
    }
    // 多個子節點：用 <> ... </> 包起來，保留每個子節點的順序。
    const childLines = children
      .map((child) => renderNode(child, options, indentLevel + 2))
      .join("\n");
    slotAttrLines.push(
      `${INDENT_UNIT.repeat(indentLevel + 1)}${key}={\n` +
        `${INDENT_UNIT.repeat(indentLevel + 2)}<>\n${childLines}\n${INDENT_UNIT.repeat(indentLevel + 2)}</>\n` +
        `${INDENT_UNIT.repeat(indentLevel + 1)}}`,
    );
  }

  const plainAttrLines = renderAttrLines(resolvedProps, indentLevel + 1);
  const allAttrLines = [...plainAttrLines, ...slotAttrLines];

  if (allAttrLines.length === 0) {
    return `${pad}<${component.componentName} />`;
  }

  return `${pad}<${component.componentName}\n${allAttrLines.join("\n")}\n${pad}/>`;
}

/** 把整個 blocks 陣列（頁面內容區的頂層組件清單）轉成一段 JSX 片段原始碼。 */
export function renderBlockListToJsx(
  blocks: PageBlock[],
  options: RenderBlockTreeToJsxOptions,
  indentLevel: number,
): string {
  if (blocks.length === 0) return `${INDENT_UNIT.repeat(indentLevel)}{null}`;
  return blocks.map((block) => renderNode(block, options, indentLevel)).join("\n");
}
