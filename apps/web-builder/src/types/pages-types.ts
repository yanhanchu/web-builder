// data/pages.json 的節點型別定義。
// 與 scripts/generate-pages.mjs 讀取的結構完全一致，
// 供 runtime 動態渲染器（DynamicRenderer）使用。

export interface ComponentNode {
  /** 對應 data/components.json 的 id（例如 "card-card"） */
  component: string;
  props?: Record<string, unknown>;
  children?: PageNode[];
}

/** 頁面節點：可以是純文字，也可以是一個 component 節點（可遞迴巢狀） */
export type PageNode = string | ComponentNode;

export interface PageDef {
  id: string;
  title: string;
  nodes: PageNode[];
}

/**
 * data/pages.json 現在以 app 做區隔（跟 i18n 的 I18nData 概念一致）：
 * app -> 該 app 底下的頁面陣列。
 * app 是一個 app / workspace 的概念，pages 的即時預覽、編輯都限定在某個 app 之下。
 */
export type PagesData = Record<string /* app */, PageDef[]>;
