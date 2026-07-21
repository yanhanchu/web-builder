// 「資料管理」的型別定義。
//
// app 底下的子功能，跟「路由管理（/routes）」同一種最簡單的管理模式
// （localStorage 為主要工作副本，另有 disk-api + write-plugin 手動同步到
// data/{app}/records/{typeId}.json），只是這裡管理的資料形狀不是固定的
// RouteEntry，而是「使用者選定的某個 @workspace/ui 組件型別（見
// packages/ui/data/component-types.json，ComponentTypeDoc）」對應的一批
// 簡單 JSON 資料。
//
// 流程：選型別（ComponentTypeDoc.id）=> 對該型別的資料做 CRUD。
//
// 目前只支援「簡單物件」與「陣列<簡單物件>」兩種編輯形態，也就是
// ComponentTypeDoc.fields 裡每個欄位的型別必須可以用簡單 JSON 表達
// （boolean / string / number，或它們的陣列），巢狀 object / 其他複雜
// 型別（例如 ReactNode、函式、參照到另一個 interface 的欄位）在 v1 先不
// 支援編輯，欄位層級會標示「不支援」，先讓使用者看得到、之後再完善。

/** 單筆資料紀錄：某個型別 id 底下的一筆簡單 JSON 物件 */
export interface DataRecordEntry {
  /** 前端產生的唯一識別碼（新增時用 crypto.randomUUID() 產生） */
  id: string;
  /**
   * 實際資料內容，形狀對應 ComponentTypeDoc.fields。
   * 只允許簡單 JSON 值：string / number / boolean / null，或上述型別的陣列。
   */
  value: Record<string, unknown>;
}

/** 單一型別底下的資料集合 */
export interface DataTypeRecords {
  /** 對應 ComponentTypeDoc.id（見 @workspace/ui 的 component-types.json） */
  typeId: string;
  records: DataRecordEntry[];
}

/**
 * data/{app}/records/{typeId}.json 的資料形狀：
 * app -> typeId -> 該型別底下的資料紀錄陣列。
 *
 * 跟 routes 同一套「localStorage 優先，手動同步到檔案系統」模式（見
 * README「App 管理」章節）。
 */
export type DataManagerData = Record<string /* app */, Record<string /* typeId */, DataRecordEntry[]>>;

/** 判斷一個型別欄位的 type 字串是否為目前支援編輯的「簡單型別」 */
export type SimpleFieldKind = 'string' | 'number' | 'boolean' | 'unsupported';

/** 判斷一個欄位型別字串是否為陣列寫法（例如 "string[]"），回傳去掉 `[]` 後的元素型別字串 */
export function getArrayElementType(type: string): string | null {
  const trimmed = type.trim();
  if (trimmed.endsWith('[]')) {
    return trimmed.slice(0, -2).trim();
  }
  const readonlyArrayMatch = trimmed.match(/^(?:ReadonlyArray|Array)<(.+)>$/);
  if (readonlyArrayMatch) {
    return readonlyArrayMatch[1].trim();
  }
  return null;
}

/** 把一個（去掉陣列符號後的）型別字串判斷成目前支援的簡單型別種類之一 */
export function classifySimpleType(type: string): SimpleFieldKind {
  const trimmed = type.trim();
  if (trimmed === 'string') return 'string';
  if (trimmed === 'number') return 'number';
  if (trimmed === 'boolean') return 'boolean';
  return 'unsupported';
}

/** 欄位層級的「這個欄位目前可不可以編輯」判斷結果 */
export interface FieldEditability {
  name: string;
  required: boolean;
  description: string;
  /** 原始型別字串，例如 "string"、"number[]"、"SomeType" */
  type: string;
  /** 是否為陣列（陣列<簡單物件> 只支援陣列<string|number|boolean>，見下方 supported 判斷） */
  isArray: boolean;
  /** 陣列元素或純量本身的簡單型別種類 */
  elementKind: SimpleFieldKind;
  /** 這個欄位目前是否支援在「資料管理」畫面編輯 */
  supported: boolean;
}
