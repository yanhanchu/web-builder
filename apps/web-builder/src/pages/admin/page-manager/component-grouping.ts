import type { ComponentDoc } from "@workspace/ui/types/generator/component-types";
import { loadComponentModule } from "@workspace/ui/lib/generator/component-registry";

// 「現有組件」分組邏輯 + 預覽用的預設 props 讀取。
//
// filePath 長相固定是 `src/components/<group...>/<file>.tsx`
// （見 packages/ui/data/components.json）。分組時把開頭的
// `src/components/` 去掉、把檔名去掉，剩下的目錄路徑當成分組 key；
// 就算之後目錄變多層（例如 demo/forms/inputs），也會攤平成同一組
// 顯示成 "demo/forms/inputs" 這樣的單一標籤，而不是巢狀樹狀結構。

const FILE_PATH_PREFIX = "src/components/";

/** 把 filePath 轉成攤平後的分組標籤，例如 "src/components/demo/avatar.tsx" -> "demo"。 */
export function groupLabelForComponent(component: ComponentDoc): string {
  let path = component.filePath;
  if (path.startsWith(FILE_PATH_PREFIX)) {
    path = path.slice(FILE_PATH_PREFIX.length);
  }
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash === -1) return "(其他)";
  return path.slice(0, lastSlash);
}

export interface ComponentGroup {
  label: string;
  components: ComponentDoc[];
}

/** 依 groupLabelForComponent 分組，並依標籤字母排序，組內維持原本順序。 */
export function groupComponents(components: ComponentDoc[]): ComponentGroup[] {
  const map = new Map<string, ComponentDoc[]>();
  for (const c of components) {
    const label = groupLabelForComponent(c);
    const list = map.get(label);
    if (list) list.push(c);
    else map.set(label, [c]);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, comps]) => ({ label, components: comps }));
}

/**
 * 依專案慣例，每個組件目錄底下的 default.ts 存放該目錄所有組件的預設 demo props，
 * export 名稱為組件名稱的 camelCase（例如 CardHeader -> cardHeader）。
 * 用同一個 loadComponentModule 動態載入，用於預覽視窗帶入示範資料。
 */
export async function loadDefaultProps(
  component: ComponentDoc
): Promise<Record<string, unknown> | null> {
  // importPath 形如 "components/demo/card"，同目錄的 default.ts 就是
  // "components/demo/default"。
  const lastSlash = component.importPath.lastIndexOf("/");
  if (lastSlash === -1) return null;
  const defaultImportPath = component.importPath.slice(0, lastSlash) + "/default";

  const exportKey =
    component.componentName.charAt(0).toLowerCase() + component.componentName.slice(1);

  try {
    const mod = await loadComponentModule(defaultImportPath);
    const value = (mod as Record<string, unknown>)[exportKey];
    return (value as Record<string, unknown>) ?? null;
  } catch {
    // 找不到 default.ts 或找不到對應 export 時，交由呼叫端顯示「無預設資料」，
    // 不擋住預覽視窗本身的開啟。
    return null;
  }
}
