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
  /**
   * 選填的 i18n 綁定 sidecar：記錄哪些文字節點 / component props 改成動態
   * 從 i18n 字典取值顯示，而不是寫死的字面內容。刻意獨立於 `nodes` 之外
   * （不混進 `PageNode` / `ComponentNode`），這樣：
   *   - 舊資料（沒有這個欄位）完全相容，viewer/generator 不需要跟著改。
   *   - `nodes` 樹本身的型別維持單純的 `string | ComponentNode`，
   *     不會因為多了一種「動態值」的節點型態而讓所有讀取 nodes 的地方
   *     都要多處理一種 case。
   * 詳細路徑格式見 page-editor.tsx 的 `I18nPathBindings`。
   */
  i18nBindings?: {
    text?: Record<string, string>;
    props?: Record<string, Record<string, string>>;
  };
}

/**
 * data/pages.json 現在以 app 做區隔（跟 i18n 的 I18nData 概念一致）：
 * app -> 該 app 底下的頁面陣列。
 * app 是一個 app / workspace 的概念，pages 的即時預覽、編輯都限定在某個 app 之下。
 */
export type PagesData = Record<string /* app */, PageDef[]>;
