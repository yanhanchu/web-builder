import type { PageNode } from '@/types/pages-types';

/**
 * `data/{app}/pages.json` 寫檔時（見 scripts/write-pages.mjs 的
 * `annotateNodesWithBindings`）會額外把 `PageDef.bindings`（path -> Binding[]
 * 的 sidecar）攤平標註回節點本身，純粹是為了讓人打開 pages.json 就能直接
 * 看出「哪個節點的哪個 prop 綁定了什麼」，格式是：
 *   - 文字節點：`"foo"` -> `{ __text: "foo", __i18nKey: "home.title" }`
 *   - component 節點：`props.__i18n = { [propName]: i18nKey }`
 *
 * 這個標註不是真正的資料來源（`bindings` 才是），dynamic-renderer.tsx /
 * generate-pages.mjs 也完全不認得它——build 期用 `import.meta.glob` 直接靜態
 * 讀進 pages.json 的這裡（見 `src/lib/data.ts`），要在進入 `pagesData` 之前
 * 先用這個函式還原成單純的 `string | ComponentNode`，維持節點樹型別跟
 * runtime 渲染器的假設一致。
 *
 * 跟 `scripts/write-pages.mjs` 裡的 `stripBindingAnnotations` 邏輯完全對應，
 * 因為一個是瀏覽器端（Vite 靜態 import 進來的模組，跑在 build 期/瀏覽器），
 * 一個是 Node 端（vite dev 的 write-back middleware），沒有共同的 runtime
 * 可以直接共用同一份程式碼，因此各自保留一份、邏輯保持同步。
 */
export function stripBindingAnnotations(nodes: PageNode[]): PageNode[] {
  return nodes.map((node) => {
    if (typeof node === 'string') return node;
    if (
      node &&
      typeof node === 'object' &&
      '__text' in node &&
      '__i18nKey' in node &&
      typeof (node as { __text?: unknown }).__text === 'string'
    ) {
      return (node as unknown as { __text: string }).__text;
    }
    const next = { ...node };
    if (next.props && typeof next.props === 'object' && '__i18n' in next.props) {
      const { __i18n: _i18n, ...restProps } = next.props as Record<string, unknown>;
      next.props = restProps;
    }
    if (Array.isArray(next.children)) {
      next.children = stripBindingAnnotations(next.children);
    }
    return next;
  });
}
