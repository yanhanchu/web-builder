// ============================================================
// data-export —— 兩套 codegen（astro-codegen / jsx-codegen）共用的
// 「一個 block 的純值 props 被抽成一筆待寫出資料」型別與建構函式。
//
// 原本 astro-codegen/render-block-tree-to-astro.ts 與
// jsx-codegen/render-block-tree-to-split-jsx.ts 各自定義了一份幾乎一模
// 一樣的 DataExport / toDataExport，這裡抽成單一份共用實作，避免後續
// 維護時漏改其中一邊。
// ============================================================

import type { VarNameAllocator } from "./var-naming";

/** 一筆被抽出來的資料 export：某個 block 的純值 props，等著被寫進某個資料檔案。 */
export interface DataExport {
  /** 這筆資料的變數名稱（camelCase，例如 "hero"），也是 export 出去的具名匯出名稱。 */
  varName: string;
  /** 來源組件名稱（PascalCase，例如 "Hero"），方便資料檔案加註解對照。 */
  componentName: string;
  /** 這個 block 對應的組件 props 型別名稱（PascalCase + "Props"，例如 "HeroProps"），用來幫資料檔案的 export 標型別註記，跟 default.ts 手寫慣例一致。找不到型別定義時為 undefined（不標型別，仍是合法程式碼，只是少了型別檢查）。 */
  propsTypeName?: string;
  /** 型別所在模組的 import 路徑（`@workspace/ui/components/...`，跟組件本身同一個檔案），資料檔案需要 import 這個路徑才能標型別註記，不會出現「型別名稱有寫但沒 import」的無效程式碼。 */
  propsTypeImportPath: string;
  /** resolved 純值（resolveValue 的輸出），呼叫端用 stringify-literal.ts 轉成程式碼字串。 */
  value: Record<string, unknown>;
  /**
   * 這個組件的 props 型別中，屬於 ReactNode（例如 "children"、"icon"）
   * 且這次「真的沒有出現在 `value` 裡」的欄位名稱——即型別是 ReactNode
   * （isSlotPropType()）與「不在 value 裡」兩個條件的交集。
   *
   * 之所以要交集而不是只看型別：ReactNode 型別的 prop 不代表這次一定被
   * 拆成巢狀 JSX，使用者也可能直接塞純字串當 children（例如
   * `<Button>test</Button>`），這種情況 "children" 會留在 `value` 裡，若
   * 仍列進 omittedPropKeys 會變成 Omit 掉一個其實有值的欄位，反而多了
   * 型別上不存在的屬性而報錯。標型別註記時要用
   * `Omit<XxxProps, "key1" | "key2">` 排除掉真的缺少的欄位，否則會少了
   * 必填欄位而型別錯誤。
   */
  omittedPropKeys: string[];
}

/** 把一個 block 的 resolved props 組成一個 DataExport（並登記進 varNames allocator）。 */
export function toDataExport(
  componentName: string,
  componentImportPath: string,
  resolvedProps: Record<string, unknown>,
  varNames: VarNameAllocator,
  omittedPropKeys: string[],
): DataExport {
  const varName = varNames.allocate(componentName);
  // props 型別名稱慣例：ComponentDoc.id 是 "{filePath}#{componentName}"，
  // 型別檔案（generator）沒有直接提供「這個組件的 props 型別名稱」欄位，
  // 但專案慣例（見 default.ts）固定是 `${componentName}Props`，這裡直接照
  // 這個慣例組出來，不去反查 component-types.json（型別是否真的存在由
  // TypeScript 編譯期檢查，這裡只是盡量產出貼近手寫慣例的型別註記）。
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
