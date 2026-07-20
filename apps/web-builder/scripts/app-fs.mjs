/**
 * 共用的「以 app 目錄為單位」讀寫檔案系統工具層。
 *
 * 新的資料配置（取代舊的 data/apps.json + data/pages.json + data/i18n/{ns}/ 三處分散配置）：
 *
 *   data/
 *     {app}/
 *       app.json        ← 原 data/apps.json 裡該 app 的一筆設定
 *       pages.json       ← 原 data/pages.json 裡該 app 的一筆頁面陣列
 *       i18n/
 *         {locale}.json    ← 原 data/i18n/{app}/{locale}.json
 *
 * 所有以 app 做區隔的資料現在都收斂在同一個 `data/{app}/` 目錄底下，
 * 「一個 app = 一個資料夾」，新增 / 刪除 / 重新命名 app 只是對單一
 * 目錄做 mkdir / rm / rename，不再需要同時更新三份各自獨立的檔案/目錄。
 *
 * 這個檔案本身不含任何 app 特定的商業邏輯（app.json / pages.json 的
 * schema 驗證等仍留在各自的 write-*.mjs），只提供共用的：
 *   - 安全的 app / 路徑組裝與驗證（防路徑穿越）
 *   - 單一 app 目錄底下某個 json 檔案的讀 / 寫
 *   - app 目錄本身的新增 / 刪除 / 重新命名
 *   - 列出目前存在哪些 app 目錄
 *
 * write-apps.mjs / write-pages.mjs / write-i18n.mjs 都建立在這層之上，
 * 是同一套「讀取 → 驗證 → 寫入」模式的三個具體應用。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const DATA_ROOT = path.join(ROOT, 'data');

/** app / locale 等路徑片段只允許英數字、底線、連字號，避免路徑穿越或不合法檔名 */
const SAFE_SEGMENT_RE = /^[a-zA-Z0-9_-]+$/;

export function isSafeSegment(segment) {
  return typeof segment === 'string' && segment.length > 0 && SAFE_SEGMENT_RE.test(segment);
}

/** 供舊呼叫端相容使用的別名（app 規則與一般路徑片段規則一致） */
export const isSafeId = isSafeSegment;

/**
 * 組出 `data/{app}/...subPaths` 的絕對路徑，並確保結果仍落在 DATA_ROOT 底下。
 * 任何一段不合法（非 isSafeSegment）都會丟出錯誤，呼叫端應先包在 try/catch，
 * 或使用回傳 result-object 的 helper（見下方 safeAppPath）。
 */
function resolveAppPath(app, ...subPaths) {
  const nsDir = path.join(DATA_ROOT, app, ...subPaths);
  const resolved = path.resolve(nsDir);
  const rootWithSep = DATA_ROOT + path.sep;
  if (resolved !== DATA_ROOT && !resolved.startsWith(rootWithSep)) {
    throw new Error('不合法的路徑（超出 data/ 目錄範圍）');
  }
  return resolved;
}

/** 回傳該 app 的資料夾路徑：data/{app}/ */
export function appDir(app) {
  return resolveAppPath(app);
}

/** 回傳該 app 底下 app.json 的路徑 */
export function appSettingsFile(app) {
  return resolveAppPath(app, 'app.json');
}

/** 回傳該 app 底下 pages.json 的路徑 */
export function appPagesFile(app) {
  return resolveAppPath(app, 'pages.json');
}

/** 回傳該 app 底下 routes.json 的路徑 */
export function appRoutesFile(app) {
  return resolveAppPath(app, 'routes.json');
}

/** 回傳該 app 底下 theme.json 的路徑（主題設定，每個 app 各自一份） */
export function appThemeFile(app) {
  return resolveAppPath(app, 'theme.json');
}

/** 回傳該 app 底下 styles.css 的路徑（主題設定產生出的 CSS 檔案，每個 app 各自一份） */
export function appStylesCssFile(app) {
  return resolveAppPath(app, 'styles.css');
}

/** 寫入單一純文字檔案（自動建立所在目錄） */
export function writeTextFile(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf-8');
}

/** 讀取單一純文字檔案，檔案不存在時回傳 fallback */
export function readTextFile(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return fallback;
  }
}

/** 回傳該 app 底下 i18n/ 目錄的路徑 */
export function appI18nDir(app) {
  return resolveAppPath(app, 'i18n');
}

/** 回傳該 app 底下 i18n/{locale}.json 的路徑 */
export function appI18nFile(app, locale) {
  if (!isSafeSegment(locale)) {
    throw new Error(`不合法的語系代碼：${JSON.stringify(locale)}`);
  }
  return resolveAppPath(app, 'i18n', `${locale}.json`);
}

/** 回傳 data/ 底下某個「非 per-app」的全域檔案路徑（目前沒有任何 per-app 之外的資料在用這個 helper，theme.json 已改為 data/{app}/theme.json） */
export function topLevelDataFile(filename) {
  if (!/^[a-zA-Z0-9_-]+\.json$/.test(filename)) {
    throw new Error(`不合法的檔名：${JSON.stringify(filename)}`);
  }
  return path.join(DATA_ROOT, filename);
}

/** 讀取單一 json 檔案，檔案不存在或解析失敗時回傳 fallback */
export function readJsonFile(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** 寫入單一 json 檔案（自動建立所在目錄），統一 2-space 縮排 + 結尾換行 */
export function writeJsonFile(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/** 判斷某 app 目錄是否存在 */
export function appExists(app) {
  if (!isSafeSegment(app)) return false;
  const dir = appDir(app);
  return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
}

/** 建立一個空的 app 目錄（若已存在則不動作） */
export function ensureAppDir(app) {
  const dir = appDir(app);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 整個刪除一個 app 目錄（若存在） */
export function removeAppDir(app) {
  const dir = appDir(app);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** 把一個 app 目錄整個改名（rename），來源不存在時不動作 */
export function renameAppDir(oldName, newName) {
  const oldDir = appDir(oldName);
  const newDir = appDir(newName);
  if (!fs.existsSync(oldDir)) return false;
  fs.mkdirSync(path.dirname(newDir), { recursive: true });
  fs.renameSync(oldDir, newDir);
  return true;
}

/** 列出 data/ 底下目前存在的所有 app 目錄名稱（依字母排序） */
export function listAppDirs() {
  if (!fs.existsSync(DATA_ROOT)) return [];
  return fs
    .readdirSync(DATA_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter(isSafeSegment)
    .sort();
}

/** 列出某個目錄底下所有 .json 檔案的「檔名（去掉副檔名）」清單，例如 i18n/ 目錄底下的 locale 清單 */
export function listJsonBasenames(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length));
}

export function toRelative(absPath) {
  return path.relative(ROOT, absPath);
}
