// 「資料管理」的型別定義（第三版）
//
// 核心設計：
//   - 選「組件（ComponentDoc）」，從其 relatedTypeNames 抓出「第一層複雜型別」
//     （排除：aliasOf / 欄位含第三方 lib 型別 / Props 型別本身）
//   - 每個複雜型別可建立無數份「命名資料集（dataset）」
//     * isArrayType=true  (NavItem[], ThemeOption[])：一份 dataset 含多個物件
//     * isArrayType=false (BrandData)              ：一份 dataset 是單一物件
//   - 巢狀 inline 物件欄位（{ lead: string; accent: string; }）也支援編輯
//
// localStorage 儲存：
//   data-manager:v3 ->
//     [app][typeId][datasetName] -> DataRecordEntry | DataRecordEntry[]

// ─── 基本 primitives ──────────────────────────────────────────────────────────

export type SimpleKind = 'string' | 'number' | 'boolean';

/** 判斷一個型別字串是否為 array，回傳元素型別字串；否則回傳 null */
export function getArrayElementType(typeStr: string): string | null {
  const t = typeStr.trim();
  if (t.endsWith('[]')) return t.slice(0, -2).trim();
  const m = t.match(/^(?:ReadonlyArray|Array)<(.+)>$/);
  if (m) return m[1].trim();
  return null;
}

/** string/number/boolean 三種 primitive */
export function classifySimpleType(typeStr: string): SimpleKind | null {
  const t = typeStr.trim();
  if (t === 'string') return 'string';
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'boolean';
  return null;
}

// ─── 欄位形狀 ─────────────────────────────────────────────────────────────────

/**
 * 解析後的欄位描述（遞迴支援巢狀物件）。
 * 只有 kind !== 'unsupported' 的欄位才會在 UI 顯示可編輯輸入框。
 */
export type ParsedField =
  | { kind: 'string';   name: string; required: boolean; description: string; isArray: false }
  | { kind: 'number';   name: string; required: boolean; description: string; isArray: false }
  | { kind: 'boolean';  name: string; required: boolean; description: string; isArray: false }
  | { kind: 'string';   name: string; required: boolean; description: string; isArray: true  }
  | { kind: 'number';   name: string; required: boolean; description: string; isArray: true  }
  | { kind: 'boolean';  name: string; required: boolean; description: string; isArray: true  }
  | {
      /** inline 物件：{ lead: string; accent: string; } 這類型別 */
      kind: 'object';
      name: string;
      required: boolean;
      description: string;
      isArray: false;
      children: ParsedField[];
    }
  | {
      kind: 'object';
      name: string;
      required: boolean;
      description: string;
      isArray: true;
      children: ParsedField[];
    }
  | { kind: 'unsupported'; name: string; required: boolean; description: string; rawType: string };

// ─── 命名資料集（dataset） ─────────────────────────────────────────────────────

/**
 * 一筆資料物件的 value：遞迴 JSON-safe 結構。
 * 巢狀物件欄位以 Record<string, RecordValue> 表示。
 */
export type RecordValue =
  | string
  | number
  | boolean
  | null
  | RecordValue[]
  | { [key: string]: RecordValue };

export interface DataRecordEntry {
  id: string;
  value: Record<string, RecordValue>;
  /**
   * 哪些 string 欄位（含巢狀，用 "." 連接路徑）改成動態取 i18n 值。
   * key 是欄位路徑（例如 "label" 或 "wordmark.lead"），value 是 i18n key 字串。
   * 平行於 value，不嵌入 RecordValue，跟 page-editor 的 i18nPropBindings 設計一致。
   */
  i18nBindings?: Record<string, string>;
}

/**
 * 一份命名資料集（dataset）。
 * - isArrayType=true  → items 是多筆物件（NavItem[]）
 * - isArrayType=false → item  是單一物件（BrandData）
 */
export type Dataset =
  | { isArrayType: true;  name: string; items: DataRecordEntry[] }
  | { isArrayType: false; name: string; item: Record<string, RecordValue>; i18nBindings?: Record<string, string> };

// ─── storage 形狀 ─────────────────────────────────────────────────────────────

/**
 * localStorage 存的整份資料結構：
 * app -> typeId -> datasetName -> Dataset
 */
export type DataManagerData = Record<
  string,                      // app
  Record<
    string,                    // typeId
    Record<string, Dataset>    // datasetName -> Dataset
  >
>;

// ─── 可管理的複雜型別 ─────────────────────────────────────────────────────────

/**
 * 從 ComponentDoc.relatedTypeNames 解析出來的「可管理型別」：
 * - typeId / typeName：對應 ComponentTypeDoc
 * - isArrayType      ：這個型別在組件 props 裡是否以 T[] 形式出現
 * - fields           ：解析後的欄位清單（已排除不支援的 top-level 型別；
 *                       巢狀物件以 kind='object' 表示）
 */
export interface ManagedType {
  typeId: string;
  typeName: string;
  /** 在組件 props 裡是否以 T[] 形式出現 */
  isArrayType: boolean;
  fields: ParsedField[];
}
