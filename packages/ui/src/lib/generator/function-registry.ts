import rawData from '../../../data/functions.json';
import type { FunctionDoc, FunctionsDocData, TypeDoc } from '@workspace/ui/types/generator/function-types';

// build time 產生的靜態資料，直接被打包進 bundle，
// 因此函式清單頁 / 詳細頁不需要任何 fetch 或 loading 狀態，用法與 registry.ts（組件文件）一致。
const data = rawData as FunctionsDocData;

export const allFunctions: FunctionDoc[] = data.functions;
export const allFunctionRelatedTypes: TypeDoc[] = data.types;

export function getFunctionById(id: string): FunctionDoc | undefined {
  return allFunctions.find((f) => f.id === id);
}

/**
 * 依陣列 index 取得函式。用法與 registry.ts 的 getComponentByIndex 一致：
 * 側邊欄樹狀結構改用陣列 index 當路由參數，避免不同目錄下同名函式的 id 撞在一起
 * 只能查到第一筆的問題（雖然目前 functions.json 裡還沒有這種同名情況，
 * 但為了跟 Components 側邊欄一致、也讓資料未來增加時不會踩到同一個坑，先一併處理）。
 */
export function getFunctionByIndex(index: number): FunctionDoc | undefined {
  return allFunctions[index];
}

export function getAllFunctionIds(): string[] {
  return allFunctions.map((f) => f.id);
}

export function getTypeByName(name: string): TypeDoc | undefined {
  return allFunctionRelatedTypes.find((t) => t.name === name);
}

/**
 * 取得某個函式簽章直接或間接用到的所有相關型別定義（依 relatedTypeNames 查找），
 * 供函式詳細頁渲染「相關型別」區塊使用。
 */
export function getRelatedTypesForFunction(fn: FunctionDoc): TypeDoc[] {
  return fn.relatedTypeNames
    .map((name) => getTypeByName(name))
    .filter((t): t is TypeDoc => Boolean(t));
}
