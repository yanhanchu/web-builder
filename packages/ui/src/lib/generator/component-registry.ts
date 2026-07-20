import rawData from '../../../data/components.json';
import type { ComponentDoc } from '@workspace/ui/types/generator/component-types';
import { componentMap } from './component-map';

// build time 產生的靜態資料，直接被打包進 bundle，
// 因此組件清單頁 / 列表頁不需要任何 fetch 或 loading 狀態。
export const allComponents: ComponentDoc[] = rawData as ComponentDoc[];

export function getComponentById(id: string): ComponentDoc | undefined {
  return allComponents.find((c) => c.id === id);
}

/**
 * 依陣列 index 取得組件。
 * 因為 `id` 是「檔名-組件名」轉 kebab-case 而來，不同目錄下同名的組件
 * （例如 `src/components/Button/Button.tsx` 與 `src/components/ui/button.tsx`）
 * 會產生完全相同的 `id`，用 `id` 查找時永遠只會拿到第一筆，
 * 導致側邊欄樹狀結構裡的第二個 Button 點進去卻顯示第一個的內容。
 * 側邊欄改用「陣列 index」當作路由參數，才能讓每一筆資料都能被獨立定位到。
 */
export function getComponentByIndex(index: number): ComponentDoc | undefined {
  return allComponents[index];
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
