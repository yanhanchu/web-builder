// ============================================================
// render-global-css —— 把 style-sheets.json 讀進來的 StyleSheet[] 合併成
// 一份全站共用的 src/index.css。
//
// 現階段（跟 apps/web-builder/src/index.css 對齊）先簡化成「全站合併套用
// 所有樣式表」：不看 page.styleSheetIds，把 style-sheets.json 裡的每一筆
// 依原始陣列順序直接 concat 起來，套用到整個 SPA。之後如果要做到「每頁
// 精準套用 styleSheetIds」，這裡會是唯一需要換掉的地方——呼叫端
// （generate-split-jsx.ts）跟 render-page-split-jsx.ts 都不用跟著改，只是
// 換一顆 codegen 函式。
// ============================================================

import type { StyleSheet } from "../load-static-data";

/** 固定的 base 段落，跟 apps/web-builder/src/index.css 手寫的內容一致：
 * import 設計系統的 globals.css，並讓 Tailwind 掃過 packages/ui 與這個
 * 輸出目錄本身，抓到實際用到的 utility class。 */
const BASE_CSS = `@import "@workspace/ui/styles/globals.css";
@source "../../../packages/ui/src/**/*.{ts,tsx}";
@source "../**/*.{ts,tsx}";`;

/**
 * 組出 src/index.css 內容：base 段落 + 依序接上每份 StyleSheet 的 css
 * 內容（用註解標出來源 id/name，方便之後追溯是哪一筆樣式表）。
 * 空字串的 css（例如範例資料裡的 "Test" 那筆）直接略過，不留空段落。
 */
export function renderGlobalCss(styleSheets: StyleSheet[]): string {
  const sheetsSource = styleSheets
    .filter((sheet) => sheet.css.trim().length > 0)
    .map((sheet) => `/* ---- styleSheet: ${sheet.id}（${sheet.name}） ---- */\n${sheet.css.trim()}`)
    .join("\n\n");

  return sheetsSource ? `${BASE_CSS}\n\n${sheetsSource}\n` : `${BASE_CSS}\n`;
}
