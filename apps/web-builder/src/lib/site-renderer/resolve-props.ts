// ============================================================
// resolve-props —— 把一個 PageBlock 的 props 解析成「真正組件可以直接吃」的值
//
// 從 apps/web-builder canvas-panel.tsx 的 resolvePlainPropValue 抽出，
// 拿掉任何跟畫布 UI（拖曳、選取、hover）相關的東西，純粹是：
//   PageBlock.props（可能是裸值，也可能是 component-properties-panel 寫回的
//   ValueNode: { mode: 'literal'|'bound'|'array'|'object', ... }）
//     + DataStore + locale
//   -> 純值
//
// 因為不依賴 React，這裡可以同時被：
//   - 編輯器畫布（canvas-panel.tsx）即時渲染
//   - 靜態產生器（Node 端 renderToStaticMarkup）
//   - 之後的 Astro 整合
// 三處共用，不需要各自重寫一份「怎麼把 ValueNode 解成純值」的邏輯。
// ============================================================

import type { DataStore, FieldType, ValueNode } from "@/lib/data-model/schema";
import { resolveValue } from "@/lib/data-model/schema";

/**
 * 判斷是否為舊版 ComplexField（component-properties-panel.tsx 的「具名複雜型別」
 * 欄位，例如 brand: BrandData、primaryNav: NavItem[]、themeOptions: ThemeOption[]）
 * 寫回的綁定引用格式 `{ __bound: true, sourceId }`。
 *
 * 這個格式從來不是 ValueNode（沒有 `mode` 欄位），過去只在 component-properties-panel.tsx
 * 內部被讀寫（ComplexField 的 select onChange / boundSourceId 判斷），從未被
 * resolvePlainPropValue／resolveValue 認得——也就是說，只要有 prop 是透過
 * ComplexField 綁定 typedData（而不是透過 BindableField，那些一律會被
 * toValueNode 轉成正規 ValueNode 才寫回），畫布與靜態產生器解析 props 時都會
 * 直接把這個裸物件原封不動傳給真正的組件，導致依賴該 prop 的邏輯（例如
 * `primaryNav.map(...)`）在執行期噴錯——這是「複雜型別 prop 綁定 typedData
 * 後，畫布渲染失敗」這類問題的根因，不是巧合或個別組件的問題，任何用
 * ComplexField 綁定過的具名型別 prop 都會遇到。
 *
 * 修法：在真正 resolve 之前，把這個舊格式正規化成 `{ mode: "bound", sourceId }`
 * ——跟 ComplexField 綁定當下語意完全一致（「這個 prop 整包等於某筆
 * typedData 的值」），resolveValue 對 `mode: "bound"` 的處理本來就不管
 * `type` 是什麼、也不需要在乎綁定的來源型別是 named type 還是別的，直接
 * 沿用即可，不需要另外新增分支。
 */
function isLegacyComplexBinding(value: unknown): value is { __bound: true; sourceId?: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as { __bound?: unknown }).__bound === true
  );
}

/**
 * 判斷一個原始 prop 值是不是 component-properties-panel 寫回的 ValueNode
 * 格式（{ mode: 'literal' | 'bound' | 'array' | 'object', ... }）。
 *
 * 舊資料（尚未被屬性面板碰過）可能是裸的 string/number/boolean/object/array，
 * 不是 ValueNode，這種情況原樣回傳，不嘗試解析。
 */
export function isValueNodeShape(value: unknown): value is ValueNode {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { mode?: unknown }).mode === "string" &&
    ["literal", "bound", "array", "object"].includes((value as { mode: string }).mode)
  );
}

/**
 * 把 rawValue 正規化成 resolveValue 看得懂的 ValueNode（若可以的話）：
 *   - 已經是 ValueNode：原樣回傳。
 *   - 舊版 ComplexField 綁定格式（{ __bound: true, sourceId }）：轉成
 *     { mode: "bound", sourceId }。
 *   - 其餘（裸值、或兩者都不是）：回傳 null，呼叫端視為「不需要 resolve」。
 */
function normalizeToValueNode(value: unknown): ValueNode | null {
  if (isValueNodeShape(value)) return value;
  if (isLegacyComplexBinding(value)) {
    return { mode: "bound", sourceId: value.sourceId ?? "" };
  }
  return null;
}

export interface ResolvePropOptions {
  /** 解析失敗時是否要 throw（預設 false：吞掉錯誤、回傳原始值，保底優先於正確）。 */
  strict?: boolean;
}

/**
 * 把單一 prop 的原始值解析成純值。
 * - 不是 ValueNode（含正規化後的舊版 __bound 綁定）或找不到對應 fieldType：原樣回傳。
 * - 是 ValueNode 且有 fieldType：呼叫 resolveValue()。
 * - 解析過程拋錯：strict 為 true 時往上拋，否則回傳原始值（畫布沿用的行為）。
 */
export function resolvePlainPropValue(
  rawValue: unknown,
  fieldType: FieldType | undefined,
  store: DataStore,
  locale: string,
  options: ResolvePropOptions = {},
  defaultLocale?: string,
): unknown {
  const node = normalizeToValueNode(rawValue);
  if (!node || !fieldType) return rawValue;

  try {
    return resolveValue(fieldType, node, store, { locale, defaultLocale });
  } catch (err) {
    if (options.strict) throw err;
    // 解析失敗也不該讓呼叫端整個炸掉，退回原始值（跟畫布原本行為一致）。
    return rawValue;
  }
}

/**
 * 把一整組 plainProps（splitSlotProps 拆出的非 slot props）依 propsFieldType
 * 逐一解析成最終要傳給真正組件的純值 props。
 *
 * propsFieldType 是 componentPropsRegistry[componentId]?.propsType，
 * 型別必須是 kind: 'object'，找不到對應欄位的 fieldType 時該欄位原樣回傳。
 */
export function resolvePlainProps(
  plainProps: Record<string, unknown>,
  propsFieldType: FieldType | undefined,
  store: DataStore,
  locale: string,
  options: ResolvePropOptions = {},
  defaultLocale?: string,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(plainProps)) {
    const fieldType: FieldType | undefined =
      propsFieldType?.kind === "object" ? propsFieldType.fields[key] : undefined;
    resolved[key] = resolvePlainPropValue(rawValue, fieldType, store, locale, options, defaultLocale);
  }
  return resolved;
}