// ============================================================
// var-naming —— componentName -> 資料變數名稱（camelCase），
// 對照 apps/web-builder/src/pages/index.tsx 手寫的慣例：
//   Hero -> hero, ValueProps -> valueProps, CtaBanner -> ctaBanner
//
// 拆分版 code generator（split-jsx-codegen）用這裡的命名規則幫每個 block
// 的 resolved props 取一個「資料變數名稱」，給資料檔案 export、也給頁面
// `.tsx` import 時使用（`import { hero } from "./data/..."`）。
// ============================================================

/** componentName（PascalCase，例如 "Hero"）轉成 camelCase 變數名稱（"hero"）。 */
export function componentNameToVarName(componentName: string): string {
  if (componentName.length === 0) return componentName;
  return componentName.charAt(0).toLowerCase() + componentName.slice(1);
}

/**
 * 同一個檔案裡可能出現多個相同 componentName 的 block（例如同一頁用了兩次
 * Card），camelCase 後的變數名稱會撞名。這裡在撞名時依序加上數字後綴
 * （hero, hero2, hero3, ...），跟 JS identifier 唯一性規則一致，同時維持
 * 「看名字就知道對應哪個組件」的可讀性（不用 instanceId 這種不好認的字串）。
 *
 * 呼叫端建議每個檔案各自建立一個新的 VarNameAllocator（不要跨檔案共用），
 * 因為變數名稱只需要在單一檔案（單一 export 範圍）內唯一。
 */
export class VarNameAllocator {
  private readonly counts = new Map<string, number>();

  /** 依 componentName 配一個保證在這個 allocator 生命週期內唯一的變數名稱。 */
  allocate(componentName: string): string {
    const base = componentNameToVarName(componentName);
    const count = (this.counts.get(base) ?? 0) + 1;
    this.counts.set(base, count);
    return count === 1 ? base : `${base}${count}`;
  }
}
