// ============================================================
// import-flat-data-to-storage —— export-flat-data-to-server 的反向操作。
//
// export-flat-data-to-server 是把 buildFlatDataFiles() 組出的攤平檔案
// POST 給 dev server，寫到 data/{appName}/ 目錄；這裡則是相反方向：
// 拿到一份「跟 buildFlatDataFiles() 輸出同樣結構」的攤平檔案（key 是相對
// 路徑、value 是檔案內容字串），直接還原回 localStorage 的五個 key
// （wb.dataSources / wb.locales / wb.pages / wb.sharedBlocks /
// wb.styleSheets），整包蓋掉。
//
// 明確不考慮衝突問題：這裡是「用檔案整包取代」，不是「合併」。所以不會
// 呼叫 flatKindToSources / flatI18nToSources 那套逐筆比對既有資料、記錄
// kindConflicts / typeConflicts 的匯入邏輯 —— 那是給「使用者在 UI 上零星
// 貼一段 JSON 匯入」的情境用的。這裡直接把每個攤平檔案內的 key 補回
// id/kind 組成完整 DataSource，全部塞進同一份新的 sources map，
// 覆蓋掉 localStorage 現有內容。
// ============================================================

import {
  flatKeyToSourceId,
  i18nKeyToSourceId,
  type DataSource,
  type FlatKind,
  type I18nPrimitiveValue,
  type PrimitiveType,
} from "@/lib/data-model";
import {
  PAGES_STORAGE_KEY,
  SHARED_BLOCKS_STORAGE_KEY,
  type PageItem,
  type SharedBlockDefinition,
} from "@/lib/page-model";
import type { StyleSheet } from "../pages/admin/style-manager";
import { STYLE_SHEETS_KEY } from "../pages/admin/style-manager";

/** 跟 usePersistentState 存 localStorage 用的 key 一致，這裡另外收斂成常數方便重用。 */
const DATA_SOURCES_KEY = "wb.dataSources";
const LOCALES_KEY = "wb.locales";

/** 輸入：檔案相對路徑（相對於 data/ 根目錄）-> 檔案內容字串，格式跟 ExportedFiles 對稱。 */
export type ImportFlatDataFiles = Map<string, string> | Record<string, string>;

export interface ImportFlatDataToStorageResult {
  /** 實際寫入 localStorage 的 key 清單。 */
  writtenKeys: string[];
  /** 檔案內容不是合法 JSON、或格式對不上預期形狀而被略過的檔案路徑清單。 */
  skipped: { path: string; reason: string }[];
}

const FLAT_KINDS: FlatKind[] = ["route", "file", "typedData"];
const I18N_FILE_PATTERN = /^sources\/i18n\.(.+)\.json$/;
const PAGE_FILE_PATTERN = /^pages\/(.+)\.json$/;
const SHARED_BLOCK_FILE_PATTERN = /^shared-blocks\/(.+)\.json$/;

function toEntries(files: ImportFlatDataFiles): [string, string][] {
  return files instanceof Map ? Array.from(files.entries()) : Object.entries(files);
}

function tryParseJson(content: string): { ok: true; value: unknown } | { ok: false; reason: string } {
  try {
    return { ok: true, value: JSON.parse(content) };
  } catch {
    return { ok: false, reason: "不是合法的 JSON" };
  }
}

function inferPrimitiveType(value: I18nPrimitiveValue): PrimitiveType {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

/**
 * 把一份攤平檔案（buildFlatDataFiles() 輸出的同構格式）整包還原成
 * localStorage 的五個 key，直接覆蓋，不考慮跟現有 localStorage 內容的衝突。
 *
 * 呼叫端寫完之後通常需要重新整理頁面（或自行觸發 state 重新從
 * localStorage 讀取），這個函式本身只負責寫 localStorage，不處理 React state。
 */
export function importFlatDataToStorage(files: ImportFlatDataFiles): ImportFlatDataToStorageResult {
  const entries = toEntries(files);
  const skipped: ImportFlatDataToStorageResult["skipped"] = [];

  // --- sources：route / file / typedData 三種 kind + 各 locale 的 i18n，
  // 全部併成同一份新的 DataSource map，直接取代，不跟舊資料比對。 ---
  const sources: Record<string, DataSource> = {};

  // --- locales：從實際出現的 sources/i18n.<locale>.json 檔名還原，
  // 不依賴 locales.json 以外的來源判斷「這個語系存在」。 ---
  const locales = new Set<string>();

  let pages: PageItem[] | undefined;
  const pagesById = new Map<string, PageItem>();
  let sharedBlocks: SharedBlockDefinition[] | undefined;
  const sharedBlocksById = new Map<string, SharedBlockDefinition>();
  let styleSheets: StyleSheet[] | undefined;
  let styleSheetRecordsRaw: { id: string; name: string; cssFile: string }[] | undefined;

  for (const [path, content] of entries) {
    const i18nMatch = path.match(I18N_FILE_PATTERN);
    if (i18nMatch) {
      const locale = i18nMatch[1];
      const parsed = tryParseJson(content);
      if (!parsed.ok) {
        skipped.push({ path, reason: parsed.reason });
        continue;
      }
      if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
        skipped.push({ path, reason: "頂層必須是物件" });
        continue;
      }
      locales.add(locale);
      for (const [key, value] of Object.entries(parsed.value as Record<string, unknown>)) {
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
          continue; // 不合法的 i18n value：跳過這一筆，不整份檔案略過
        }
        const id = i18nKeyToSourceId(key);
        const existing = sources[id];
        if (existing && existing.kind === "i18n") {
          existing.values[locale] = value;
        } else {
          sources[id] = {
            id,
            kind: "i18n",
            label: key,
            valueType: inferPrimitiveType(value),
            values: { [locale]: value },
          };
        }
      }
      continue;
    }

    const flatKind = FLAT_KINDS.find((kind) => path === `sources/${kind}.json`);
    if (flatKind) {
      const parsed = tryParseJson(content);
      if (!parsed.ok) {
        skipped.push({ path, reason: parsed.reason });
        continue;
      }
      if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
        skipped.push({ path, reason: "頂層必須是物件" });
        continue;
      }
      for (const [key, entry] of Object.entries(parsed.value as Record<string, unknown>)) {
        const id = flatKeyToSourceId(flatKind, key);
        // 不考慮衝突：直接補回 id/kind 覆蓋掉同 id 可能已存在的資料
        // （例如 i18n 檔案先處理、剛好補了同一個 id，這裡也是直接蓋過去）。
        sources[id] = { id, kind: flatKind, ...(entry as object) } as DataSource;
      }
      continue;
    }

    const pageMatch = path.match(PAGE_FILE_PATTERN);
    if (pageMatch) {
      const parsed = tryParseJson(content);
      if (!parsed.ok) {
        skipped.push({ path, reason: parsed.reason });
        continue;
      }
      if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
        skipped.push({ path, reason: "頂層必須是物件" });
        continue;
      }
      const page = parsed.value as PageItem;
      // 用檔名本身（pageMatch[1]）當 key，不是完全信任檔案內容裡的 page.id
      // ——避免檔名跟內容 id 對不上時，同一次匯入裡出現「兩個檔名不同、
      // 但 id 相同」互相覆蓋、順序卻改用檔名排序的不一致情況。
      pagesById.set(pageMatch[1], page);
      continue;
    }

    const sharedBlockMatch = path.match(SHARED_BLOCK_FILE_PATTERN);
    if (sharedBlockMatch) {
      const parsed = tryParseJson(content);
      if (!parsed.ok) {
        skipped.push({ path, reason: parsed.reason });
        continue;
      }
      if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
        skipped.push({ path, reason: "頂層必須是物件" });
        continue;
      }
      // 跟 pages/{pageId}.json 同一套理由：用檔名而非內容裡的 id 當 key，
      // 避免檔名跟內容 id 對不上時互相覆蓋、排序又改用檔名的不一致情況。
      sharedBlocksById.set(sharedBlockMatch[1], parsed.value as SharedBlockDefinition);
      continue;
    }

    if (path === "locales.json") {
      const parsed = tryParseJson(content);
      if (!parsed.ok) {
        skipped.push({ path, reason: parsed.reason });
        continue;
      }
      if (!Array.isArray(parsed.value)) {
        skipped.push({ path, reason: "頂層必須是陣列" });
        continue;
      }
      for (const l of parsed.value as unknown[]) {
        if (typeof l === "string") locales.add(l);
      }
      continue;
    }

    if (path === "style-sheets.json") {
      const parsed = tryParseJson(content);
      if (!parsed.ok) {
        skipped.push({ path, reason: parsed.reason });
        continue;
      }
      if (!Array.isArray(parsed.value)) {
        skipped.push({ path, reason: "頂層必須是陣列" });
        continue;
      }
      // 檔案系統上的形狀是 { id, name, cssFile }（見 export-flat-data.ts），
      // 這裡先記住 records，實際 css 內容要等所有檔案都掃過一輪、確定
      // style-sheets/{id}.css 是否存在於這次的 entries 裡才能還原，
      // 所以延後到迴圈跑完後再組（見下方 styleSheetRecords 處理）。
      styleSheetRecordsRaw = parsed.value as { id: string; name: string; cssFile: string }[];
      continue;
    }

    // 其他不認得的路徑（例如未來新增的檔案）直接忽略，不視為錯誤。
  }

  // pages/{pageId}.json 逐檔收集完成後，依檔名（pageId）排序組回陣列——
  // 拆成逐頁檔案後，檔案系統本身（例如 zip 解壓縮、readdir）不保證原本
  // pages.json 陣列的順序，這裡用穩定的字母序排序，確保同一份匯出結果
  // 每次匯入的順序都一致（順序本身目前只影響頁面管理列表的預設顯示順序，
  // 不影響路由或建置結果）。
  if (pagesById.size > 0) {
    pages = Array.from(pagesById.keys())
      .sort((a, b) => a.localeCompare(b))
      .map((id) => pagesById.get(id)!);
  }

  // shared-blocks/{id}.json 逐檔收集完成後，依檔名排序組回陣列——
  // 跟 pages/{pageId}.json 同一套理由（見上方註解）。
  if (sharedBlocksById.size > 0) {
    sharedBlocks = Array.from(sharedBlocksById.keys())
      .sort((a, b) => a.localeCompare(b))
      .map((id) => sharedBlocksById.get(id)!);
  }

  // style-sheets.json 只存 { id, name, cssFile } 指標（見 export-flat-data.ts），
  // 這裡用 entries 本身（同一批檔案裡的 style-sheets/{id}.css）反查回實際
  // CSS 內容，還原成 localStorage / 編輯器內部使用的 { id, name, css } 形狀。
  // 找不到對應 .css 檔案（例如匯入的檔案包不完整）時，該筆樣式表的 css
  // 內容退回空字串，不整份匯入失敗。
  if (styleSheetRecordsRaw !== undefined) {
    const cssByPath = new Map(entries);
    styleSheets = styleSheetRecordsRaw.map((record) => {
      const css = cssByPath.get(record.cssFile);
      if (css === undefined) {
        skipped.push({ path: record.cssFile, reason: `樣式表 "${record.id}" 對應的 CSS 檔案缺失` });
      }
      return { id: record.id, name: record.name, css: css ?? "" };
    });
  }

  const writtenKeys: string[] = [];

  // 整包覆蓋：即使某個 key 這次沒有對應檔案（例如完全沒有 pages/*.json），
  // 也不 fallback 保留 localStorage 舊值 —— 呼叫端如果需要保留，應該
  // 自行確保匯出時有帶上完整檔案。這裡的語意就是「用這包檔案取代」。
  window.localStorage.setItem(DATA_SOURCES_KEY, JSON.stringify(sources));
  writtenKeys.push(DATA_SOURCES_KEY);

  window.localStorage.setItem(LOCALES_KEY, JSON.stringify(Array.from(locales)));
  writtenKeys.push(LOCALES_KEY);

  if (pages !== undefined) {
    window.localStorage.setItem(PAGES_STORAGE_KEY, JSON.stringify(pages));
    writtenKeys.push(PAGES_STORAGE_KEY);
  }

  if (sharedBlocks !== undefined) {
    window.localStorage.setItem(SHARED_BLOCKS_STORAGE_KEY, JSON.stringify(sharedBlocks));
    writtenKeys.push(SHARED_BLOCKS_STORAGE_KEY);
  }

  if (styleSheets !== undefined) {
    window.localStorage.setItem(STYLE_SHEETS_KEY, JSON.stringify(styleSheets));
    writtenKeys.push(STYLE_SHEETS_KEY);
  }

  return { writtenKeys, skipped };
}