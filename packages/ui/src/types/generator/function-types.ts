// 此檔案由 scripts/generate-functions-docs.mjs 自動產生，請勿手動編輯。
// 執行 `npm run functions:generate` 以重新產生。

export interface FunctionParamDoc {
  name: string;
  type: string;
  optional: boolean;
  defaultValue: string | null;
  description: string;
}

export interface FunctionDoc {
  id: string;
  functionName: string;
  filePath: string;
  importPath: string;
  description: string;
  isAsync: boolean;
  deprecated: string | null;
  params: FunctionParamDoc[];
  returnType: string;
  returnDescription: string;
  throws: string[];
  /** 這個函式簽章中用到、且在專案內定義的 interface / type 名稱清單 */
  relatedTypeNames: string[];
}

export interface TypeFieldDoc {
  name: string;
  required: boolean;
  type: string;
  description: string;
}

export interface TypeDoc {
  name: string;
  kind: 'interface' | 'type';
  description: string;
  /** 若為 object 形狀（interface 或 type = { ... }），列出欄位；否則為空陣列 */
  fields: TypeFieldDoc[];
  /** 若為非 object 的 type alias（例如 union / primitive），記錄其原始定義字串 */
  aliasOf?: string;
}

export interface FunctionsDocData {
  functions: FunctionDoc[];
  types: TypeDoc[];
}
