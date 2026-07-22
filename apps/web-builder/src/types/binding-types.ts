// 通用「欄位綁定」型別：把樹狀節點（或未來的扁平表單欄位）上的某個值，
// 改成動態參照另一份資料（i18n key / 路由 id / 檔案 id / data record 等），
// 而不是寫死的字面內容。

/** 目前支援的綁定種類，之後要擴充 route/file/dataRecord 只需在這裡加一個字串。 */
export type BindingKind = "i18n";

/**
 * 單一綁定：某個 path 對應到哪種 kind、綁定到哪個 key。
 * path 的格式依使用場景而定：
 *   - 樹狀節點（頁面節點）：見下方 `nodePath`/`findNodeByPath` 等工具函式，
 *     格式為 "0.2.1" 這種以 "." 串接 children 索引的字串；
 *     component 節點的 prop 綁定，path 額外加上 "#propName" 後綴，例如 "0#title"。
 *   - 扁平表單欄位（app 設定、data record 等）：path 直接是欄位名稱本身。
 */
export interface Binding {
  kind: BindingKind;
  path: string;
  refKey: string;
}

/** 路徑上的綁定集合，key 為 path，value 為該 path 底下（可能多個 kind 的）綁定。 */
export type BindingMap = Record<string, Binding[]>;

/** 取得某個 path、某個 kind 的綁定（沒有則回傳 undefined）。 */
export function getBinding(
  bindings: BindingMap | undefined,
  path: string,
  kind: BindingKind,
): Binding | undefined {
  return bindings?.[path]?.find((b) => b.kind === kind);
}

/**
 * 設定（或移除）某個 path、某個 kind 的綁定，回傳新的 BindingMap（不可變更新）。
 * refKey 傳 undefined 代表移除該筆綁定。
 */
export function setBinding(
  bindings: BindingMap | undefined,
  path: string,
  kind: BindingKind,
  refKey: string | undefined,
): BindingMap {
  const next: BindingMap = { ...(bindings ?? {}) };
  const existing = next[path] ?? [];
  const withoutKind = existing.filter((b) => b.kind !== kind);
  const updated = refKey ? [...withoutKind, { kind, path, refKey }] : withoutKind;
  if (updated.length > 0) {
    next[path] = updated;
  } else {
    delete next[path];
  }
  return next;
}

/** BindingMap 是否完全沒有任何綁定。 */
export function isEmptyBindingMap(bindings: BindingMap | undefined): boolean {
  return !bindings || Object.keys(bindings).length === 0;
}

// ---------------------------------------------------------------------------
// 樹狀節點 path 工具：頁面節點（PageNode 樹）專用，路徑格式為
// "0.2.1"（以 "." 串接一路往下的 children 索引）。
// 新增/刪除/搬移節點時，路徑必須連帶重新計算，這件事統一在「往下寫出時
// 依當下的 nodes 順序重新產生 path」完成，呼叫端不需要自己維護路徑字串。
// ---------------------------------------------------------------------------

export function nodePath(prefix: string, index: number): string {
  return prefix ? `${prefix}.${index}` : String(index);
}

export function propPath(nodePathStr: string, propName: string): string {
  return `${nodePathStr}#${propName}`;
}

/** 依 "0.2.1" 這種路徑字串，從樹中找出對應節點。找不到回傳 undefined。
 *  `getChildren` 由呼叫端提供，決定如何從一個節點取出它的 children 陣列。 */
export function findByPath<T>(
  nodes: T[],
  path: string,
  getChildren: (node: T) => T[] | undefined,
): T | undefined {
  const parts = path.split(".").map(Number);
  let list = nodes;
  let node: T | undefined;
  for (const idx of parts) {
    node = list[idx];
    if (!node) return undefined;
    list = getChildren(node) ?? [];
  }
  return node;
}
