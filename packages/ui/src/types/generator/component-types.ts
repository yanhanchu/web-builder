export interface PropDoc {
  name: string;
  required: boolean;
  type: string;
  defaultValue: string | null;
  description: string;
}

export interface ComponentDoc {
  id: string;
  componentName: string;
  filePath: string;
  importPath: string;
  description: string;
  props: PropDoc[];
  /**
   * 這個組件 props 簽章中用到、且在專案內定義的 interface / type 名稱清單
   * （見 data/component-types.json / ComponentTypeDoc.name）。不同組件可能共用
   * 同一個型別，這裡只存名稱，實際定義查 component-types.json。
   * 由 scripts/generate-docs.mjs 產生，跟 functions 那邊的 relatedTypeNames 同一套設計。
   */
  relatedTypeNames?: string[];
}

/**
 * 詳細型別欄位（跟 FunctionParamDoc/TypeFieldDoc 對齊，供「型別詳情」畫面共用渲染）。
 */
export interface ComponentTypeFieldDoc {
  name: string;
  required: boolean;
  /** 完整型別字串，例如 string / boolean / number / string[] / SomeType[] */
  type: string;
  description: string;
}

/**
 * 一個獨立的、可被多個組件共用的型別定義。
 * `id` 是這個型別的獨立識別碼（目前實作等同 typescript 型別名稱本身，
 * 因為專案內型別名稱已保證唯一），不同 component 的 relatedTypeNames
 * 可能指向同一個 ComponentTypeDoc，藉此達成「型別可共用」。
 */
export interface ComponentTypeDoc {
  /** 型別的獨立 id，供跨組件共用參照（目前實作等於 name） */
  id: string;
  name: string;
  kind: 'interface' | 'type';
  description: string;
  /** 若為 object 形狀（interface 或 type = { ... }），列出欄位；否則為空陣列 */
  fields: ComponentTypeFieldDoc[];
  /** 若為非 object 的 type alias（例如 union / primitive），記錄其原始定義字串 */
  aliasOf?: string;
}

export interface ComponentTypesDocData {
  types: ComponentTypeDoc[];
}
