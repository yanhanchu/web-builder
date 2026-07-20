/**
 * 把 i18n 管理頁面（src/pages/i18n）編輯好的翻譯資料寫入檔案系統。
 *
 * 僅在 `vite dev` 的 middleware（見 write-i18n-plugin.mjs）被呼叫，
 * build 產物不含這支腳本的呼叫路徑，不會有寫檔 API 外洩到正式環境的疑慮。
 *
 * 檔案配置：`data/{app}/i18n/{locale}.json`
 * （收在該 app 專屬的資料夾底下，跟 app.json / pages.json 同一層）。
 */
import fs from 'node:fs';
import {
  isSafeSegment,
  readJsonFile,
  writeJsonFile,
  appI18nDir,
  appI18nFile,
  ensureAppDir,
  listJsonBasenames,
  listAppDirs,
  toRelative,
} from './app-fs.mjs';

const NESTED_KEY_SEP = '.';
const DEFAULT_VALUE_TYPE = 'string';

/** 回傳含 metadata 版本的檔名：{locale}.meta.json（跟 appI18nFile 同一個目錄底下） */
function appI18nMetaFile(app, locale) {
  const plain = appI18nFile(app, locale);
  return plain.replace(/\.json$/, '.meta.json');
}

/**
 * 把 flatten 過的 `{ "a.b.c": "value" }` 還原成巢狀 JSON（與前端
 * src/utils/i18n-utils.ts 的邏輯保持一致，包含「key 同時是葉節點又是
 * 其他 key 前綴」時改用 __self__ 保留欄位、不直接覆蓋遺失資料的處理）。
 */
function unflatten(flat) {
  const result = {};
  const entries = Object.entries(flat).sort(
    (a, b) => a[0].split(NESTED_KEY_SEP).length - b[0].split(NESTED_KEY_SEP).length
  );
  for (const [flatKey, value] of entries) {
    const parts = flatKey.split(NESTED_KEY_SEP).filter(Boolean);
    if (parts.length === 0) continue;
    let cursor = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const existing = cursor[part];
      if (existing === undefined) {
        cursor[part] = {};
      } else if (typeof existing === 'string') {
        cursor[part] = { __self__: existing };
      }
      cursor = cursor[part];
    }
    const lastKey = parts[parts.length - 1];
    const existingLeaf = cursor[lastKey];
    if (existingLeaf !== undefined && typeof existingLeaf === 'object') {
      existingLeaf.__self__ = value;
    } else {
      cursor[lastKey] = value;
    }
  }
  return result;
}

function sortKeys(flat) {
  const sorted = {};
  for (const key of Object.keys(flat).sort()) {
    sorted[key] = flat[key];
  }
  return sorted;
}

/**
 * 把巢狀 JSON 攤平成 `{ "a.b.c": "value" }`（與前端 utils.ts 的 flatten 邏輯保持一致），
 * 讀取磁碟上的 nested 格式 json 檔時用來轉回內部一律使用的 flat 形式。
 */
function flatten(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj ?? {})) {
    const fullKey = prefix ? `${prefix}${NESTED_KEY_SEP}${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flatten(value, fullKey));
    } else {
      result[fullKey] = value === null || value === undefined ? '' : String(value);
    }
  }
  return result;
}

/** 判斷一份 JSON 是否「已經是攤平的」（所有 value 都是 primitive，沒有巢狀物件） */
function isFlatJson(obj) {
  return Object.values(obj ?? {}).every(
    (v) => v === null || typeof v !== 'object' || Array.isArray(v)
  );
}

/**
 * 寫入單一 app 底下所有語系的 JSON 檔案：
 * - `data/{app}/i18n/{locale}.json`：不含 metadata，格式與原本完全相同（flat 或 nested 的 value）。
 * - `data/{app}/i18n/{locale}.meta.json`：另外多寫一份含 metadata 的版本
 *   （`{ meta: { [key]: { type } }, data: <flat 或 nested 的 value> }`）。
 *
 * @param {object} params
 * @param {string} params.app
 * @param {Record<string, Record<string, string>>} params.locales  locale -> flat dict
 * @param {'flat' | 'nested'} params.format
 * @param {Record<string, string>} [params.keyTypes]  key -> type，用於含 metadata 的那份檔案
 * @returns {{ ok: true, writtenFiles: string[] } | { ok: false, error: string }}
 */
export function writeAppToDisk({ app, locales, format, keyTypes }) {
  try {
    if (!isSafeSegment(app)) {
      return { ok: false, error: `不合法的 app 名稱：${app}` };
    }
    for (const locale of Object.keys(locales ?? {})) {
      if (!isSafeSegment(locale)) {
        return { ok: false, error: `不合法的語系代碼：${locale}` };
      }
    }

    ensureAppDir(app);
    const nsI18nDir = appI18nDir(app);
    fs.mkdirSync(nsI18nDir, { recursive: true });

    const writtenFiles = [];
    for (const [locale, flatDict] of Object.entries(locales ?? {})) {
      const valueData = format === 'flat' ? sortKeys(flatDict) : unflatten(flatDict);

      // 1) 不含 metadata 的版本（與原本格式相同）
      const filePath = appI18nFile(app, locale);
      writeJsonFile(filePath, valueData);
      writtenFiles.push(toRelative(filePath));

      // 2) 含 metadata 的版本（另外多寫一份）
      const meta = {};
      for (const key of Object.keys(flatDict).sort()) {
        meta[key] = { type: keyTypes?.[key] ?? DEFAULT_VALUE_TYPE };
      }
      const metaFilePath = appI18nMetaFile(app, locale);
      writeJsonFile(metaFilePath, { meta, data: valueData });
      writtenFiles.push(toRelative(metaFilePath));
    }

    return { ok: true, writtenFiles };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 讀取 `data/{app}/i18n/` 底下所有語系檔案，還原成前端使用的 flat 形式。
 * 檔案本身可能是 nested 或已攤平（flat）格式，兩者都會自動偵測並統一轉成 flat。
 * 若同時存在對應的 `{locale}.meta.json`，會一併讀出其中的 key type 標記並合併回傳
 * （多個語系的 meta 檔案若有衝突，後面讀到的語系會覆蓋前面的）。
 *
 * @param {object} params
 * @param {string} params.app
 * @returns {{ ok: true, app: string, locales: Record<string, Record<string,string>>, localeFiles: string[], keyTypes: Record<string,string> } | { ok: false, error: string }}
 */
export function readAppFromDisk({ app }) {
  try {
    if (!isSafeSegment(app)) {
      return { ok: false, error: `不合法的 app 名稱：${app}` };
    }

    const nsI18nDir = appI18nDir(app);
    if (!fs.existsSync(nsI18nDir) || !fs.statSync(nsI18nDir).isDirectory()) {
      return { ok: false, error: `找不到 data/${app}/i18n/ 目錄` };
    }

    // 只挑「主要」語系檔（排除 *.meta.json 本身，避免被誤判成一個叫做 xx.meta 的語系）
    const localeNames = listJsonBasenames(nsI18nDir)
      .filter((name) => !name.endsWith('.meta'))
      .filter(isSafeSegment);
    if (localeNames.length === 0) {
      return { ok: false, error: `data/${app}/i18n/ 底下沒有任何 .json 檔案` };
    }

    const locales = {};
    const localeFiles = [];
    const keyTypes = {};
    for (const locale of localeNames) {
      const filePath = appI18nFile(app, locale);
      const parsed = readJsonFile(filePath, undefined);
      if (parsed === undefined) {
        return { ok: false, error: `${toRelative(filePath)} 不是合法 JSON` };
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, error: `${toRelative(filePath)} 的根節點必須是物件` };
      }
      locales[locale] = isFlatJson(parsed) ? parsed : flatten(parsed);
      localeFiles.push(toRelative(filePath));

      // 選擇性讀取對應的 metadata 檔案（不存在就跳過，不影響主要讀取結果）
      const metaFilePath = appI18nMetaFile(app, locale);
      const metaParsed = readJsonFile(metaFilePath, undefined);
      if (
        metaParsed &&
        typeof metaParsed === 'object' &&
        !Array.isArray(metaParsed) &&
        metaParsed.meta &&
        typeof metaParsed.meta === 'object'
      ) {
        for (const [key, entry] of Object.entries(metaParsed.meta)) {
          const type = entry && typeof entry === 'object' ? entry.type : undefined;
          keyTypes[key] = typeof type === 'string' ? type : DEFAULT_VALUE_TYPE;
        }
        localeFiles.push(toRelative(metaFilePath));
      }
    }

    return { ok: true, app, locales, localeFiles, keyTypes };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 列出目前有 i18n 資料的 app 清單，供之後擴充選單使用。
 * @returns {{ ok: true, apps: string[] } | { ok: false, error: string }}
 */
export function listAppsOnDisk() {
  try {
    return { ok: true, apps: listAppDirs() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
