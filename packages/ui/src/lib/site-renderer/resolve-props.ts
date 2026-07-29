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

import type { DataStore, FieldType, ValueNode } from "@workspace/ui/lib/data-model/schema";
import { resolveValue } from "@workspace/ui/lib/data-model/schema";

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

export interface ResolvePropOptions {
  /** 解析失敗時是否要 throw（預設 false：吞掉錯誤、回傳原始值，保底優先於正確）。 */
  strict?: boolean;
}

/**
 * 把單一 prop 的原始值解析成純值。
 * - 不是 ValueNode 或找不到對應 fieldType：原樣回傳。
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
  if (!isValueNodeShape(rawValue) || !fieldType) return rawValue;

  try {
    return resolveValue(fieldType, rawValue, store, { locale, defaultLocale });
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