import rawData from '../../../data/components.json';
import rawTypesData from '../../../data/component-types.json';
import type { ComponentDoc, ComponentTypeDoc } from '@workspace/ui/types/generator/component-types';
import { componentMap } from './component-map';

// build time 產生的靜態資料，直接被打包進 bundle，
// 因此組件清單頁 / 列表頁不需要任何 fetch 或 loading 狀態。
export const allComponents: ComponentDoc[] = rawData as ComponentDoc[];

/**
 * 所有組件 props 用到的相關型別（跨組件共用，見 scripts/generate-docs.mjs）。
 * 每筆型別的 id 為 `{filePath}#{typeName}`，保證跨檔案不重複。
 */
export const allComponentTypes: ComponentTypeDoc[] = (rawTypesData as { types: ComponentTypeDoc[] }).types;

export function getComponentTypeById(id: string): ComponentTypeDoc | undefined {
  return allComponentTypes.find((t) => t.id === id);
}

/**
 * `id` 目前實作為 `{filePath}#{componentName}`，同時涵蓋「不同目錄同名組件」
 * 與「同一檔案內多個具名匯出」兩種情況，天生全域唯一，可以直接用來查找。
 */
export function getComponentById(id: string): ComponentDoc | undefined {
  return allComponents.find((c) => c.id === id);
}

export function getAllComponentIds(): string[] {
  return allComponents.map((c) => c.id);
}

/**
 * 動態載入某個組件的實際模組（給 Live Preview 用）。
 * componentMap 是由 scripts/generate-docs.mjs 產生的靜態 import 表，
 * 每一條路徑在編譯期就已經是 import() 字面量，因此 Vite 能正確做 code-splitting。
 */
export async function loadComponentModule(
  importPath: string
): Promise<Record<string, unknown>> {
  const loader = componentMap[importPath];
  if (!loader) {
    throw new Error(`找不到 "${importPath}" 對應的動態載入設定，請確認已執行 npm run docs:generate`);
  }
  return loader();
}
