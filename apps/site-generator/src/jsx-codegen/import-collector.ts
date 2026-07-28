// ============================================================
// import-collector —— 收集 code generator 走訪 block 樹時遇到的組件 import，
// 去重、排序，最後產生一段 import 語句原始碼。
//
// 一個頁面可能重複使用同一個組件多次（例如 ValueProps 裡多個 Card），
// 每個 componentId 只需要 import 一次；同一個 importPath 下如果有多個具名
// export 被用到（目前每個 ComponentDoc 只對應一個 componentName，但保留
// 「同路徑多個具名 import 合併成一行」的能力，避免之後組件模組拆分時
// 產生重複的 import 語句）。
// ============================================================

/** 把 component-registry 的 importPath（例如 "components/landing1/hero"）
 * 轉成 `.tsx` 檔案裡要寫的實際 import 路徑（"@workspace/ui/components/landing1/hero"）。
 * 跟 component-map.ts 的 import() 字面量、以及 web-builder pages/index.tsx
 * 手寫 import 的慣例一致。 */
export function toWorkspaceImportPath(importPath: string): string {
  return `@workspace/ui/${importPath}`;
}

export class ImportCollector {
  // key: 實際要寫進程式碼的 import 路徑；value: 這個路徑底下用到的具名 export 集合
  private readonly named = new Map<string, Set<string>>();

  /** 記錄一個「從某個路徑 import 某個具名 export」的需求。可重複呼叫，自動去重。 */
  add(importPath: string, exportName: string): void {
    const existing = this.named.get(importPath);
    if (existing) {
      existing.add(exportName);
    } else {
      this.named.set(importPath, new Set([exportName]));
    }
  }

  /**
   * 產生排序後的 import 語句原始碼（每行一個路徑，具名 export 依字母序排列）。
   * 路徑本身也排序，讓多次執行 code generator 產生的檔案內容穩定（方便 diff）。
   */
  render(): string {
    const paths = Array.from(this.named.keys()).sort();
    return paths
      .map((importPath) => {
        const names = Array.from(this.named.get(importPath)!).sort();
        return `import { ${names.join(", ")} } from "${importPath}";`;
      })
      .join("\n");
  }

  get isEmpty(): boolean {
    return this.named.size === 0;
  }
}
