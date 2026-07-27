import type { ComponentDoc } from "@workspace/ui/types/generator/component-types";
import { allComponents, loadComponentModule } from "@workspace/ui/lib/generator/component-registry";
import { isSlotValue, isSlotPropType } from "@/lib/pages-store";

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

/**
 * 把組件加入畫布（page-manager.tsx 的 addBlock）時，用來決定新 block 的
 * props 初始值：直接沿用 loadDefaultProps 讀到的 default.ts 示範資料，
 * 而不是空物件 {} —— 沒有預設值的必填 prop（例如按鈕的 label、圖片的 src）
 * 在畫布即時渲染下會直接讓組件壞掉或整片空白，帶入跟「現有組件」預覽
 * 一致的示範資料可以避免這個情況，使用者看到的第一眼就是「看起來對」的樣子，
 * 之後在右側屬性面板再依需求覆寫。
 *
 * 例外只有一種：default.ts 給的值「本身」就是 SlotValue 結構
 * （{ __slot: true, blocks: [...] }），這種形狀是 PageBlock 樹狀資料，不能
 * 直接塞進 block.props（那個欄位只接受純值或 SlotValue，見 pages-store.ts），
 * 這裡才會濾掉該 key，讓該 prop 維持「未設定」——畫布渲染時 splitSlotProps
 * 找不到對應的 SlotValue，該 slot 自然視為空，使用者要放子組件的話，透過
 * 「組件屬性」面板的 slot 欄位新增即可。
 *
 * 判斷「要不要濾掉」用的是值本身的實際形狀（isSlotValue），不是 prop 的型別
 * 字串宣告（isSlotPropType）：型別標成 ReactNode 的 prop（例如 Button.children、
 * icon）在 default.ts 裡給的示範值通常是純字串或純節點，不是 SlotValue，若用
 * 型別字串一律過濾會誤刪這些必填的示範資料，導致新增到畫布的組件缺少必填
 * prop 而渲染失敗或整片空白（即使「現有組件」預覽因為直接吃完整 demoProps，
 * 未經此函式過濾，看起來完全正常）。
 *
 * 找不到 default.ts（loadDefaultProps 回傳 null）時回傳空物件，行為等同
 * 修改前的「新增時 props 為空」，不會擋住加入動作本身。
 */
export async function loadDefaultBlockProps(
  component: ComponentDoc
): Promise<Record<string, unknown>> {
  const demoProps = await loadDefaultProps(component);
  if (!demoProps) return {};

  const blockProps: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(demoProps)) {
    // 只有值本身「真的是」SlotValue 結構（{ __slot: true, blocks: [...] }）才濾掉，
    // 因為那種形狀是 PageBlock 樹狀資料，不能直接塞進 block.props（只接受純值 /
    // SlotValue，見 pages-store.ts）。
    //
    // 不能用 prop 的「型別字串」（isSlotPropType）判斷要不要濾掉：default.ts 裡
    // 型別標成 ReactNode 的 prop（例如 Button.children、icon）給的示範值常常是
    // 純字串或純節點，不是 SlotValue —— 用型別字串過濾會把這些必填的示範文字
    // 整個濾掉，導致新增到畫布的組件因為缺少必填 prop 而渲染失敗或整片空白，
    // 即使「現有組件」預覽（LivePreview 直接吃完整 demoProps，未經此函式）看起來
    // 完全正常。
    if (isSlotValue(value)) continue;
    blockProps[key] = value;
  }
  return blockProps;
}

/** 依 componentId 找組件定義，容錯路徑分隔符號與大小寫（跨平台 / 手動輸入時可能不一致）。 */
export function findComponentById(componentId: string): ComponentDoc | undefined {
  return (
    allComponents.find((c) => c.id === componentId) ??
    allComponents.find(
      (c) => c.id.replace(/\\/g, "/").toLowerCase() === componentId.replace(/\\/g, "/").toLowerCase()
    )
  );
}

/**
 * 這個組件定義裡，有哪些 prop 是可以放子組件的 slot（依宣告順序）。
 * 「組件樹狀結構」面板（component-tree-modal.tsx）與畫布巢狀拖放
 * （canvas-panel.tsx）共用同一份判斷，避免兩處各自維護一份、之後改一處
 * 忘了改另一處而悄悄不一致。
 */
export function slotPropsOf(componentId: string): string[] {
  const component = findComponentById(componentId);
  if (!component) {
    if (typeof console !== "undefined") {
      console.warn(`[component-grouping] 找不到 componentId="${componentId}" 對應的組件定義。`);
    }
    return [];
  }
  return component.props.filter((p) => isSlotPropType(p.type)).map((p) => p.name);
}