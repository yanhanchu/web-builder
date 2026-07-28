// ============================================================
// render-page-data —— 把一個 page 在某個 locale 下用到的資料，resolve 成
// 純值，攤平成一份「這個 locale 專用」的 JSON。
//
// 對應 roadmap.md「每種 locale 編成一份獨立的 json」這個需求。跟
// render-page-jsx.ts 是同一份 code generator 邏輯的兩種輸出：
//   - render-page-jsx.ts：組件結構 + resolved 純值 -> 一份固定 locale 的 .tsx
//   - render-page-data.ts（這裡）：同一組 resolved 純值 -> 一份獨立 JSON，
//     方便日後檢視/比對某個 locale 的資料內容。這份 JSON 純粹是靜態產出物，
//     不是給 .tsx 在瀏覽器裡讀取、動態切換 locale 用的 runtime 資料。
//
// 每個 block 一筆，key 用 instanceId（跟 page.blocks 對得上），value 是
// resolvePlainProps 出來的純值 props（巢狀 slot 底下的子 block 也遞迴收錄，
// 用同一個 instanceId 索引，攤平成一層 map，不巢狀，方便直接查表）。
// ============================================================

import type { DataStore } from "@workspace/ui/lib/data-model/schema";
import { componentPropsRegistry } from "@workspace/ui/lib/data-model/from-generated";
import { getComponentById } from "@workspace/ui/lib/generator/component-registry";
import { splitSlotProps, type PageBlock, type PageItem } from "@workspace/ui/lib/page-model";
import { resolvePlainProps } from "@workspace/ui/lib/site-renderer/resolve-props";

/** 單一 block 的 resolved 資料紀錄。 */
export interface ResolvedBlockData {
  componentId: string;
  componentName: string;
  /** 這個 block 的純值 props（不含 slot；slot 底下的子 block 各自另外一筆，用 instanceId 索引）。 */
  props: Record<string, unknown>;
  /** 每個 slot prop 對應的子 block instanceId 清單，用來還原巢狀結構。 */
  slots: Record<string, string[]>;
}

export interface RenderedPageData {
  pageId: string;
  locale: string;
  /** instanceId -> resolved block 資料，攤平成一層（含所有巢狀 slot 底下的子節點）。 */
  blocks: Record<string, ResolvedBlockData>;
  /** 頂層（頁面內容區）block 的 instanceId 順序清單。 */
  rootBlockIds: string[];
  warnings: string[];
}

function collectBlockData(
  block: PageBlock,
  locale: string,
  store: DataStore,
  acc: Record<string, ResolvedBlockData>,
  warnings: string[],
): void {
  const component = getComponentById(block.componentId);
  if (!component) {
    warnings.push(`找不到組件定義（componentId: ${block.componentId}, instanceId: ${block.instanceId}）`);
    return;
  }

  const { plainProps, slotProps } = splitSlotProps(block);
  const propsFieldType = componentPropsRegistry[component.id]?.propsType;
  const resolvedProps = resolvePlainProps(plainProps, propsFieldType, store, locale);

  const slots: Record<string, string[]> = {};
  for (const [key, children] of Object.entries(slotProps)) {
    slots[key] = children.map((c) => c.instanceId);
    for (const child of children) {
      collectBlockData(child, locale, store, acc, warnings);
    }
  }

  acc[block.instanceId] = {
    componentId: component.id,
    componentName: component.componentName,
    props: resolvedProps,
    slots,
  };
}

/** 產出一個 (page, locale) 的攤平 resolved 資料。 */
export function renderPageData(page: PageItem, locale: string, store: DataStore): RenderedPageData {
  const blocks: Record<string, ResolvedBlockData> = {};
  const warnings: string[] = [];

  for (const block of page.blocks) {
    collectBlockData(block, locale, store, blocks, warnings);
  }

  return {
    pageId: page.id,
    locale,
    blocks,
    rootBlockIds: page.blocks.map((b) => b.instanceId),
    warnings: warnings.map((w) => `[${page.id}/${locale}] ${w}`),
  };
}
