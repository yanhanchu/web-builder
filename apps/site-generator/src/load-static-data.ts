// ============================================================
// load-static-data —— 讀攤平匯出的 JSON 檔案，組回產生器需要的完整資料集
//
// 只做「讀檔 + 呼叫既有轉換函式」，不重新發明資料格式：
//   - i18n.*.json（每個 locale 一份，單語系攤平物件）
//       -> flatI18nToSources()（packages/ui/src/lib/data-model/i18n-flat.ts）
//   - route.json / file.json / typedData.json（攤平物件，去除 id/kind）
//       -> flatKindToSources()（packages/ui/src/lib/data-model/flat-export.ts）
//   - pages.json -> PageItem[]（page-model 的形狀，用 normalizePage 補齊欄位）
//   - locales.json -> string[]
//   - style-sheets.json -> StyleSheet[]（{ id, name, css }，跟
//     apps/web-builder/src/pages/admin/style-manager.tsx 的 StyleSheet 同形狀，
//     這裡不 import 那個檔案，因為它是 app 端頁面、混了 React state；
//     這裡用同結構的本地型別即可，靠 JSON 形狀對齊，不是靠 import 對齊）
//
// 這個檔案跟 React 無關，之後如果要換掉 render-page.ts（例如改接 Astro），
// 這裡完全不需要動。
// ============================================================

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { DataSource } from "@workspace/ui/lib/data-model/schema";
import { flatI18nToSources, type FlatI18nRecord } from "@workspace/ui/lib/data-model/i18n-flat";
import {
  flatKindToSources,
  type FlatFileRecord,
  type FlatRouteRecord,
  type FlatTypedDataRecord,
} from "@workspace/ui/lib/data-model/flat-export";
import { normalizePage, type PageItem } from "@workspace/ui/lib/page-model";

export interface StyleSheet {
  id: string;
  name: string;
  css: string;
}

export interface StaticSiteData {
  /** 還原完成的完整 DataSource map（key 為 source id），直接可餵給 InMemoryDataStore。 */
  sources: Record<string, DataSource>;
  /** 頁面清單（已用 normalizePage 補齊欄位）。 */
  pages: PageItem[];
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

  // --- pages / locales.json（若提供則覆蓋掃描到的 i18n locale 清單）/ style-sheets ---
  const pagesRaw = await readJsonIfExists(path.join(dataDir, "pages.json"));
  const pages = Array.isArray(pagesRaw) ? pagesRaw.map((p) => normalizePage(p as Partial<PageItem>)) : [];

  const localesRaw = await readJsonIfExists(path.join(dataDir, "locales.json"));
  const resolvedLocales = Array.isArray(localesRaw) && localesRaw.every((l) => typeof l === "string")
    ? (localesRaw as string[])
    : locales;

  const styleSheetsRaw = await readJsonIfExists(path.join(dataDir, "style-sheets.json"));
  const styleSheets = Array.isArray(styleSheetsRaw) ? (styleSheetsRaw as StyleSheet[]) : [];

  if (resolvedLocales.length === 0) {
    issues.push({ file: dataDir, message: "找不到任何語系（locales.json 缺漏，且 sources/ 底下沒有 i18n.*.json）" });
  }
  if (pages.length === 0) {
    issues.push({ file: path.join(dataDir, "pages.json"), message: "頁面清單為空，將不會產生任何頁面" });
  }

  return { sources, pages, locales: resolvedLocales, styleSheets, issues };
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
