// ============================================================
// export-flat-data —— 把 web-builder（localStorage）裡的資料，匯出成
// apps/site-generator/src/load-static-data.ts 讀取的攤平檔案格式。
//
// 這是 packages/ui/src/lib/data-model/{flat-export,i18n-flat}.ts 裡
// sourcesToFlatKind() / sourcesToFlatI18n() 這兩個「反向」函式一直沒有
// 呼叫端的補完 —— 之前只有「匯入」（flatKindToSources / flatI18nToSources）
// 有人呼叫（DataSourceManager 的匯入功能），「匯出」則完全沒有任何 UI
// 觸發，所以 data/ 底下的攤平檔案只能手動拼。
//
// 純函式、不依賴 React／DOM，方便之後如果要加「CLI 也能匯出」或改成
// 其他觸發方式（例如存到 server）時直接重用，不綁死在某個按鈕的 onClick 裡。
// ============================================================

import {
  sourcesToFlatKind,
  sourcesToFlatI18n,
  type DataSource,
} from "@/lib/data-model";
import type { PageItem, SharedBlockDefinition } from "@/lib/page-model";
import type { StyleSheet } from "../pages/admin/style-manager";

export interface ExportFlatDataInput {
  sources: Record<string, DataSource>;
  locales: string[];
  pages: PageItem[];
  sharedBlocks: SharedBlockDefinition[];
  styleSheets: StyleSheet[];
}

/** 匯出結果：檔案相對路徑（相對於 data/ 根目錄）-> 檔案內容字串。 */
export type ExportedFiles = Map<string, string>;

/**
 * 組出所有攤平檔案的內容，key 是相對於 `data/` 的路徑
 * （例如 "sources/route.json"、"pages/home.json"），value 是格式化過的 JSON 字串。
 *
 * 只組內容、不做任何檔案 I/O 或下載動作 —— 那些留給呼叫端（瀏覽器用
 * downloadZip，之後若要接 CLI／server 也能直接重用這個函式）。
 */
export function buildFlatDataFiles(input: ExportFlatDataInput): ExportedFiles {
  const { sources, locales, pages, sharedBlocks, styleSheets } = input;
  const files: ExportedFiles = new Map();

  // --- sources/i18n.<locale>.json：每個語系各自攤平一份 ---
  // 跟 load-static-data.ts 的 findI18nFiles() 用同一套檔名慣例
  // （i18n.<locale>.json），locales 清單裡的每個語系都固定產出一份檔案
  // （即使該語系目前一筆翻譯都沒有，也輸出空物件 {}，維持「這個語系存在」
  // 這件事本身可被之後的匯入端偵測到，不會因為檔案缺席而被誤判成語系不存在）。
  for (const locale of locales) {
    const flat = sourcesToFlatI18n(sources, locale);
    files.set(`sources/i18n.${locale}.json`, stringify(flat));
  }

  // --- sources/route.json / file.json / typedData.json ---
  files.set("sources/route.json", stringify(sourcesToFlatKind(sources, "route")));
  files.set("sources/file.json", stringify(sourcesToFlatKind(sources, "file")));
  files.set("sources/typedData.json", stringify(sourcesToFlatKind(sources, "typedData")));

  // --- pages/{pageId}.json：每個頁面各自一份純值檔案（不需要攤平轉換，
  // load-static-data.ts 直接 JSON.parse 後當純資料使用），不再合併成單一
  // pages.json —— 理由：頁面數量多時單一大檔案每次编輯任何一頁都要整份
  // 改動、diff 很難看；拆成逐頁檔案後，改一頁只動一個檔案，也方便之後
  // 個別頁面各自比對／版控。
  for (const page of pages) {
    files.set(`pages/${page.id}.json`, stringify(page));
  }

  // --- shared-blocks/{id}.json：每個共用區塊定義各自一份純值檔案，
  // 跟 pages/{pageId}.json 同一套理由（逐筆拆檔，改一筆只動一個檔案，
  // diff／版控都比單一大檔案好）——直接照抄那段寫法。
  for (const definition of sharedBlocks) {
    files.set(`shared-blocks/${definition.id}.json`, stringify(definition));
  }

  // --- locales.json：直接存純值，不需要攤平轉換
  // （load-static-data.ts 直接 JSON.parse 後當純資料使用）---
  files.set("locales.json", stringify(locales));

  // --- style-sheets.json + style-sheets/{id}.css：
  // localStorage / 編輯器內部（style-manager.tsx）仍然用 { id, name, css }
  // 這個形狀（方便即時編輯），但寫到檔案系統時要拆開：css 內容各自落地成
  // 獨立的 style-sheets/{id}.css，style-sheets.json 只留 { id, name, cssFile }
  // 這個指標形狀。理由跟 pages/*.json 拆成逐頁檔案一樣：CSS 內容如果直接
  // 內嵌在 JSON 字串裡，換行/縮排全部要跳脫，人眼難編輯、git diff 也幾乎
  // 沒有意義；拆成獨立 .css 檔案後可以正常編輯、正常 diff。
  // 對應的還原邏輯在 load-static-data.ts 的 loadStyleSheets()。
  const styleSheetRecords = styleSheets.map((sheet) => {
    const cssFile = `style-sheets/${sheet.id}.css`;
    files.set(cssFile, sheet.css);
    return { id: sheet.id, name: sheet.name, cssFile };
  });
  files.set("style-sheets.json", stringify(styleSheetRecords));

  return files;
}

function stringify(value: unknown): string {
  // 兩個空白縮排、檔尾補一個換行：跟專案裡其他手寫 JSON 攤平檔案的風格一致，
  // 方便 diff／人工檢視，也避免不同工具產生的檔案在檔尾換行符上互相打架。
  return `${JSON.stringify(value, null, 2)}\n`;
}