export interface PropDoc {
  name: string;
  required: boolean;
  type: string;
  defaultValue: string | null;
  description: string;
}

export interface ComponentDoc {
  /** 這個組件的獨立 id，格式為 `{filePath}#{componentName}`
   * （例如 `src/components/demo/card.tsx#CardHeader`），
   * 避免不同目錄下同名組件、或同一檔案內多個具名匯出互相撞名。 */
  id: string;
  componentName: string;
  filePath: string;
  importPath: string;
  description: string;
  props: PropDoc[];
  /**
   * 這個組件 props 簽章中用到、且在專案內定義的型別 id 清單
   * （見 data/component-types.json / ComponentTypeDoc.id）。不同組件可能共用
   * 同一個型別，這裡只存 id，實際定義查 component-types.json。
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
 * `id` 是這個型別的獨立識別碼，格式為 `{型別宣告所在檔案的 filePath}#{型別名稱}`
 * （例如 `src/components/demo/types.ts#BrandData`），因為型別名稱只在單一檔案內
 * 保證唯一，用「宣告檔案路徑 + 型別名稱」組合才能保證全域唯一、避免不同檔案裡
 * 同名但定義不同的型別互相覆蓋。不同 component 的 relatedTypeNames 可能指向
 * 同一個 ComponentTypeDoc，藉此達成「型別可共用」。
 */
export interface ComponentTypeDoc {
  /** 型別的獨立 id，格式為 `{filePath}#{typeName}`，供跨組件共用參照 */
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
