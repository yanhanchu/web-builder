// ============================================================
// data-file-writer —— 把 DataExport[]（render-block-tree-to-split-jsx.ts
// 抽出來的「每個 block 的純值 props」）組成實際的 `.ts` 資料檔案內容。
//
// 對照 apps/web-builder/src/pages/index.tsx import 的
// `packages/ui/src/components/landing1/default.ts`，這裡產生同樣形狀的
// 檔案（`export const hero: HeroProps = {...}`），差別是內容來自
// resolveValue() 而不是手寫。
//
// 「檔案不一定在同一個，可能 by 區塊或語系分開」：這裡不假設只有一種分法，
// 用 DataFileGroupingStrategy 決定「這批 DataExport 要分成幾個檔案、
// 每個檔案裝哪些 export、檔名是什麼」，目前提供兩種現成策略：
//   - groupAllInOneFile：整個頁面一份檔案（最接近 index.tsx 範例的樣子）
//   - groupByComponentName：每個組件名稱一份檔案（例如 hero.ts、footer.ts），
//     適合「同一個組件在不同頁面重複使用時，資料檔案也可能想共用」的情境
// 呼叫端（render-page-split-jsx.ts）可以自行決定要用哪一種、或提供自訂策略。
// ============================================================

import { stringifyLiteralValue } from "./stringify-literal";
import { ImportCollector } from "./import-collector";
import type { DataExport } from "./render-block-tree-to-split-jsx";

export interface DataFileGroup {
  /** 這個資料檔案的檔名（不含副檔名），例如 "data" 或 "hero"。 */
  fileBaseName: string;
  exports: DataExport[];
}

export type DataFileGroupingStrategy = (dataExports: DataExport[]) => DataFileGroup[];

/** 整個頁面的所有資料 export 塞進同一個檔案（檔名固定叫 "data"）。 */
export const groupAllInOneFile: DataFileGroupingStrategy = (dataExports) => {
  if (dataExports.length === 0) return [];
  return [{ fileBaseName: "data", exports: dataExports }];
};

/**
 * 依 componentName 分組，每個組件名稱一個檔案（camelCase 檔名，例如
 * "hero.ts"、"valueProps.ts"）。同一頁若用了兩次同組件（varName 已經被
 * VarNameAllocator 去重過，例如 hero / hero2），會落在同一個檔案裡，
 * 用多個 export 區分。
 */
export const groupByComponentName: DataFileGroupingStrategy = (dataExports) => {
  const byComponent = new Map<string, DataExport[]>();
  for (const exp of dataExports) {
    const key = exp.componentName.charAt(0).toLowerCase() + exp.componentName.slice(1);
    const bucket = byComponent.get(key);
    if (bucket) bucket.push(exp);
    else byComponent.set(key, [exp]);
  }
  return Array.from(byComponent.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fileBaseName, exports]) => ({ fileBaseName, exports }));
};

/**
 * 把一組 DataExport 組成一份 `.ts` 檔案內容字串：
 *   import type { HeroProps } from "@workspace/ui/components/landing1/hero";
 *   import type { FooterProps } from "@workspace/ui/components/landing1/footer";
 *
 *   export const hero: HeroProps = { ... };
 *   export const footer: FooterProps = { ... };
 *
 * 型別 import 會自動收集、去重、排序（用 ImportCollector 的 typeOnly 模式），
 * 確保每個標了型別註記的 export 都對應一筆真的 import 進來的型別，不會出現
 * 「型別名稱有寫但沒 import」的無效程式碼。
 */
export function renderDataFileContent(group: DataFileGroup, headerComment: string): string {
  const typeImports = new ImportCollector();
  for (const exp of group.exports) {
    if (exp.propsTypeName) {
      typeImports.add(exp.propsTypeImportPath, exp.propsTypeName);
    }
  }
  const typeImportsSource = typeImports.render({ typeOnly: true });

  const body = group.exports
    .map((exp) => {
      // slot props（例如 "children"、"header"）不會出現在 exp.value 裡，
      // 直接標 `: XxxProps` 會因為缺少這些必填欄位而型別錯誤，所以用
      // `Omit<XxxProps, "key1" | "key2">` 排除掉，型別上只保留這裡真的有
      // 值的純值 props（跟 render-page-split-jsx.ts 產生的 JSX 對得起來：
      // slot 部分改用巢狀 JSX 表示，不透過這份資料檔案）。
      const typeAnnotation = exp.propsTypeName
        ? exp.omittedPropKeys.length > 0
          ? `: Omit<${exp.propsTypeName}, ${exp.omittedPropKeys.map((k) => JSON.stringify(k)).join(" | ")}>`
          : `: ${exp.propsTypeName}`
        : "";
      const valueSource = stringifyLiteralValue(exp.value, 0);
      return `export const ${exp.varName}${typeAnnotation} = ${valueSource};`;
    })
    .join("\n\n");

  const importsBlock = typeImportsSource ? `${typeImportsSource}\n\n` : "";

  return `${headerComment}\n\n${importsBlock}${body}\n`;
}