// ============================================================
// load-static-data —— 讀攤平匯出的 JSON 檔案，組回產生器需要的完整資料集
//
// 只做「讀檔 + 呼叫既有轉換函式」，不重新發明資料格式：
//   - i18n.*.json（每個 locale 一份，單語系攤平物件）
//       -> flatI18nToSources()（packages/ui/src/lib/data-model/i18n-flat.ts）
//   - route.json / file.json / typedData.json（攤平物件，去除 id/kind）
//       -> flatKindToSources()（packages/ui/src/lib/data-model/flat-export.ts）
//   - pages/{pageId}.json -> PageItem[]（page-model 的形狀，用 normalizePage 補齊欄位；
//     逐頁各自一份檔案，掃描 pages/ 目錄後依檔名排序組回陣列，見 findPageFiles()）
//   - locales.json -> string[]
//   - style-sheets.json -> StyleSheet[]（對外形狀是 { id, name, css }，跟
//     apps/web-builder/src/pages/admin/style-manager.tsx 的 StyleSheet 同形狀，
//     這裡不 import 那個檔案，因為它是 app 端頁面、混了 React state；用同
//     結構的本地型別即可，靠 JSON 形狀對齊，不是靠 import 對齊）
//
//     檔案上實際存的形狀是 StyleSheetRecord { id, name, cssFile }：CSS 內容
//     不直接內嵌在 JSON 字串裡（那樣換行/縮排全部要跳脫，人眼難編輯、git
//     diff 也幾乎沒意義），而是另外存成獨立的 .css 檔案，`cssFile` 存相對
//     dataDir 的路徑（例如 "style-sheets/global.css"）。讀取時 loadStyleSheets()
//     把檔案內容讀出來併回 css 欄位，之後拿到的仍是形狀不變的 StyleSheet，
//     render-page.ts / renderGlobalCss 等呼叫端完全不用跟著改。
//
// 這個檔案跟 React 無關，之後如果要換掉 render-page.ts（例如改接 Astro），
// 這裡完全不需要動。
// ============================================================

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { DataSource } from "../../src/lib/data-model/schema";
import { flatI18nToSources, type FlatI18nRecord } from "../../src/lib/data-model/i18n-flat";
import {
  flatKindToSources,
  type FlatFileRecord,
  type FlatRouteRecord,
  type FlatTypedDataRecord,
} from "../../src/lib/data-model/flat-export";
import {
  normalizePage,
  normalizeSharedBlockDefinition,
  type PageItem,
  type SharedBlockDefinition,
} from "../../src/lib/page-model";

export interface StyleSheet {
  id: string;
  name: string;
  css: string;
}

/**
 * `style-sheets.json` 檔案上實際的攤平形狀：只存 id/name/cssFile 這三個
 * 欄位，`css` 內容本身不內嵌在這裡（見本檔案開頭說明）。讀取時會把
 * `cssFile` 指到的檔案內容讀出來，併回 StyleSheet.css，對外（render-page.ts
 * 等呼叫端）拿到的仍然是形狀不變的 StyleSheet，不需要跟著改。
 */
interface StyleSheetRecord {
  id: string;
  name: string;
  cssFile: string;
}

export interface StaticSiteData {
  /** 還原完成的完整 DataSource map（key 為 source id），直接可餵給 InMemoryDataStore。 */
  sources: Record<string, DataSource>;
  /** 頁面清單（已用 normalizePage 補齊欄位）。 */
  pages: PageItem[];
  /** 共用區塊定義清單（已用 normalizeSharedBlockDefinition 補齊欄位），供 SharedBlockRef 生成時 resolve。 */
  sharedBlocks: SharedBlockDefinition[];
  /** 啟用的語系清單，例如 ["zh-TW", "en"]。 */
  locales: string[];
  /** 樣式表清單，供 render-page.ts 依 page.styleSheetIds 挑選要注入的 <style>。 */
  styleSheets: StyleSheet[];
  /** 讀取過程中的非致命問題（型別衝突、格式不符的 key 等），全部收集、不中斷流程。 */
  issues: LoadIssue[];
}

export interface LoadIssue {
  file: string;
  message: string;
}

export interface LoadStaticDataOptions {
  /** 攤平資料根目錄，預設等同 README 建議的 `data/`（含 sources/ 子目錄）。 */
  dataDir: string;
}

/** 讀一個 JSON 檔，檔案不存在時回傳 undefined，呼叫端直接判斷 undefined 即可。 */
async function readJsonIfExists(filePath: string): Promise<unknown | undefined> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (isErrnoException(err) && err.code === "ENOENT") return undefined;
    throw new Error(`讀取或解析 JSON 失敗：${filePath}\n${err instanceof Error ? err.message : String(err)}`);
  }
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

/**
 * 掃描 sources/ 目錄找出所有 `i18n.<locale>.json` 檔案，回傳 locale -> 檔案路徑。
 * 檔名慣例跟 README 一致：`i18n.zh-TW.json`、`i18n.en.json`。
 */
async function findI18nFiles(sourcesDir: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  let entries: string[];
  try {
    entries = await readdir(sourcesDir);
  } catch (err) {
    if (isErrnoException(err) && err.code === "ENOENT") return result;
    throw err;
  }
  for (const entry of entries) {
    const match = entry.match(/^i18n\.(.+)\.json$/);
    if (match) result.set(match[1], path.join(sourcesDir, entry));
  }
  return result;
}

/**
 * 掃描 `pages/` 目錄找出所有頁面檔案（`pages/{pageId}.json`），依檔名（不含
 * 副檔名）排序回傳完整路徑清單——跟 export-flat-data.ts 的 buildFlatDataFiles()
 * 一頁一份檔案的慣例對齊，取代原本單一的 `pages.json`。排序用字母序，確保
 * 同一份資料每次產生的結果都一致（順序目前只影響頁面管理列表的預設顯示
 * 順序，不影響路由或建置結果）。
 */
async function findPageFiles(pagesDir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(pagesDir);
  } catch (err) {
    if (isErrnoException(err) && err.code === "ENOENT") return [];
    throw err;
  }
  return entries
    .filter((entry) => entry.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b))
    .map((entry) => path.join(pagesDir, entry));
}

/**
 * 掃描 `shared-blocks/` 目錄找出所有共用區塊定義檔案
 * （`shared-blocks/{id}.json`），依檔名（不含副檔名）排序回傳完整路徑
 * 清單——完全比照 findPageFiles()，跟 export-flat-data.ts 的
 * buildFlatDataFiles() 一筆定義一份檔案的慣例對齊。
 */
async function findSharedBlockFiles(sharedBlocksDir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(sharedBlocksDir);
  } catch (err) {
    if (isErrnoException(err) && err.code === "ENOENT") return [];
    throw err;
  }
  return entries
    .filter((entry) => entry.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b))
    .map((entry) => path.join(sharedBlocksDir, entry));
}

/**
 * 讀入 `data/` 目錄下所有攤平檔案，組回 StaticSiteData。
 *
 * 讀取順序刻意固定（i18n 先、其餘 kind 後）：i18n 各 locale 檔案彼此疊加
 * （flatI18nToSources 的 existingSources 機制），route/file/typedData 彼此
 * 獨立、id 前綴不同不會互撞，順序對結果沒有影響，這裡固定順序只是方便閱讀
 * issues 訊息時能對照到穩定的處理流程。
 */
export async function loadStaticData(options: LoadStaticDataOptions): Promise<StaticSiteData> {
  const { dataDir } = options;
  const sourcesDir = path.join(dataDir, "sources");
  const pagesDir = path.join(dataDir, "pages");
  const sharedBlocksDir = path.join(dataDir, "shared-blocks");
  const issues: LoadIssue[] = [];

  let sources: Record<string, DataSource> = {};

  // --- i18n：每個 locale 一份檔案，疊加進同一份 sources ---
  const i18nFiles = await findI18nFiles(sourcesDir);
  const locales: string[] = [];
  for (const [locale, filePath] of i18nFiles) {
    locales.push(locale);
    const raw = await readJsonIfExists(filePath);
    if (raw === undefined) continue;
    const record = raw as FlatI18nRecord;
    const result = flatI18nToSources(record, { locale, existingSources: sources });
    sources = { ...sources, ...result.sources };
    for (const c of result.typeConflicts) {
      issues.push({
        file: filePath,
        message: `i18n key "${c.key}" 型別衝突：既有為 ${c.existingType}，這次匯入為 ${c.incomingType}，已略過`,
      });
    }
    for (const c of result.kindConflicts) {
      issues.push({
        file: filePath,
        message: `i18n key "${c.key}" 對應的 id 已被 ${c.existingKind} 佔用，已略過`,
      });
    }
  }

  // --- route / file / typedData：各自一份攤平檔案 ---
  sources = await mergeFlatKindFile(sourcesDir, "route.json", "route", sources, issues);
  sources = await mergeFlatKindFile(sourcesDir, "file.json", "file", sources, issues);
  sources = await mergeFlatKindFile(sourcesDir, "typedData.json", "typedData", sources, issues);

  // --- pages/：逐頁各自一份檔案，掃描目錄後依檔名排序讀取、逐一 normalizePage ---
  const pageFiles = await findPageFiles(pagesDir);
  const pages: PageItem[] = [];
  for (const filePath of pageFiles) {
    const raw = await readJsonIfExists(filePath);
    if (raw === undefined) continue;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      issues.push({ file: filePath, message: "頁面檔案頂層必須是物件，已略過" });
      continue;
    }
    pages.push(normalizePage(raw as Partial<PageItem>));
  }

  // --- shared-blocks/：逐筆各自一份檔案，掃描目錄後依檔名排序讀取、
  // 逐一 normalizeSharedBlockDefinition，完全比照上面 pages/ 的讀法。 ---
  const sharedBlockFiles = await findSharedBlockFiles(sharedBlocksDir);
  const sharedBlocks: SharedBlockDefinition[] = [];
  for (const filePath of sharedBlockFiles) {
    const raw = await readJsonIfExists(filePath);
    if (raw === undefined) continue;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      issues.push({ file: filePath, message: "共用區塊定義檔案頂層必須是物件，已略過" });
      continue;
    }
    sharedBlocks.push(normalizeSharedBlockDefinition(raw as Partial<SharedBlockDefinition>));
  }

  const localesRaw = await readJsonIfExists(path.join(dataDir, "locales.json"));
  const resolvedLocales = Array.isArray(localesRaw) && localesRaw.every((l) => typeof l === "string")
    ? (localesRaw as string[])
    : locales;

  const styleSheets = await loadStyleSheets(dataDir, issues);

  if (resolvedLocales.length === 0) {
    issues.push({ file: dataDir, message: "找不到任何語系（locales.json 缺漏，且 sources/ 底下沒有 i18n.*.json）" });
  }
  if (pages.length === 0) {
    issues.push({ file: pagesDir, message: "頁面清單為空，將不會產生任何頁面" });
  }

  return { sources, pages, sharedBlocks, locales: resolvedLocales, styleSheets, issues };
}

/**
 * 讀 `style-sheets.json`（StyleSheetRecord[] 形狀，只有 id/name/cssFile），
 * 逐筆把 `cssFile` 指到的 .css 檔案內容讀出來，組回完整的 StyleSheet[]
 * （含 css 欄位）給呼叫端（render-page.ts / renderGlobalCss）使用。
 *
 * 單筆讀取失敗（檔案不存在等）不中斷整個流程：記一筆 issue，該筆樣式表
 * 的 css 內容退回空字串，其餘樣式表照常處理。
 */
async function loadStyleSheets(dataDir: string, issues: LoadIssue[]): Promise<StyleSheet[]> {
  const jsonPath = path.join(dataDir, "style-sheets.json");
  const raw = await readJsonIfExists(jsonPath);
  if (!Array.isArray(raw)) return [];

  const records = raw as StyleSheetRecord[];
  const result: StyleSheet[] = [];
  for (const record of records) {
    const cssPath = path.join(dataDir, record.cssFile);
    let css = "";
    try {
      css = await readFile(cssPath, "utf-8");
    } catch (err) {
      issues.push({
        file: cssPath,
        message: `樣式表 "${record.id}" 對應的 cssFile 讀取失敗，內容視為空字串：${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
    result.push({ id: record.id, name: record.name, css });
  }
  return result;
}

async function mergeFlatKindFile(
  sourcesDir: string,
  fileName: string,
  kind: "route" | "file" | "typedData",
  existingSources: Record<string, DataSource>,
  issues: LoadIssue[],
): Promise<Record<string, DataSource>> {
  const filePath = path.join(sourcesDir, fileName);
  const raw = await readJsonIfExists(filePath);
  if (raw === undefined) return existingSources;

  const result = flatKindToSources(
    kind,
    raw as FlatRouteRecord | FlatFileRecord | FlatTypedDataRecord,
    { existingSources },
  );
  for (const c of result.kindConflicts) {
    issues.push({
      file: filePath,
      message: `key "${c.key}" 對應的 id 已被 ${c.existingKind} 佔用，已略過`,
    });
  }
  return { ...existingSources, ...result.sources };
}