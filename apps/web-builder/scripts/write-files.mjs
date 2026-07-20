/**
 * 把「檔案管理」（/files，FileManager）上傳的檔案本體寫入
 * `public/uploads/{app}/`，模擬「上傳到後端」的行為。
 *
 * 僅在 `vite dev` 的 middleware（見 write-files-plugin.mjs）被呼叫，
 * build 產物不含這支腳本的呼叫路徑，不會有寫檔 API 外洩到正式環境的疑慮。
 *
 * 檔案配置：`public/uploads/{app}/{storedName}`
 *   - {app}：跟 data/{app}/ 同一套安全字元規則（isSafeSegment）
 *   - {storedName}：`{id}-{sanitizedOriginalName}`，同時保留原始檔名
 *     （含副檔名）與唯一的 id 前綴——單純用原始檔名容易在同一 app 底下
 *     重複上傳同名檔案時互相覆蓋，單純用 id 又會遺失原始檔案資訊
 *     （檔名 / 副檔名），因此兩者都保留，前綴 id 確保不衝突，
 *     其餘部分保留原始檔名方便從檔案總管辨識內容。
 *
 * public/ 底下的檔案會被 Vite 原樣複製到 build 產物、且 dev server 本身
 * 就會把 public/ 當靜態資源目錄提供，因此寫入後前端可以直接用
 * `/uploads/{app}/{storedName}` 當 <img src> 或下載連結使用，不需要額外的
 * 讀取 API。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSafeSegment } from './app-fs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_ROOT = path.join(ROOT, 'public');
const UPLOADS_ROOT = path.join(PUBLIC_ROOT, 'uploads');

/**
 * 把原始檔名清理成可安全落地磁碟的檔名：
 *   - 只保留英數字、底線、連字號、點；其餘字元（含中文、空白、斜線等）
 *     一律換成底線，避免路徑穿越或不同檔案系統的相容性問題。
 *   - 沒有原始檔名，或清理後變成空字串時，回傳 'file' 當 fallback，
 *     確保一定會有可用的檔名主體。
 */
function sanitizeOriginalName(originalName) {
  const base = typeof originalName === 'string' ? originalName.trim() : '';
  if (!base) return 'file';
  // 只取檔名本身（避免帶入路徑分隔符造成路徑穿越），再做字元清理
  const baseNameOnly = base.replace(/^.*[/\\]/, '');
  const cleaned = baseNameOnly.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '');
  return cleaned || 'file';
}

/** 組出 `public/uploads/{app}/{id}-{sanitizedOriginalName}` 的絕對路徑，並確保結果落在 UPLOADS_ROOT 底下 */
function resolveUploadPath(app, id, originalName) {
  if (!isSafeSegment(app)) {
    throw new Error(`不合法的 app 名稱：${JSON.stringify(app)}`);
  }
  if (!isSafeSegment(id)) {
    throw new Error(`不合法的檔案 id：${JSON.stringify(id)}`);
  }
  const safeName = sanitizeOriginalName(originalName);
  const storedName = `${id}-${safeName}`;
  const filePath = path.resolve(UPLOADS_ROOT, app, storedName);
  const appDirWithSep = path.resolve(UPLOADS_ROOT, app) + path.sep;
  if (!filePath.startsWith(appDirWithSep)) {
    throw new Error('不合法的路徑（超出 public/uploads/{app}/ 目錄範圍）');
  }
  return { filePath, storedName };
}

/**
 * 把檔案 bytes 寫入 `public/uploads/{app}/{id}-{originalName}`，
 * 保留原始檔名（含副檔名），方便日後從磁碟直接辨識檔案內容。
 *
 * @param {object} params
 * @param {string} params.app
 * @param {string} params.id
 * @param {string} params.originalName  原始檔名（保留在最終存檔檔名中）
 * @param {Buffer} params.buffer        檔案內容
 * @returns {{ ok: true, url: string, storedName: string, originalName: string } | { ok: false, error: string }}
 */
export function writeUploadedFile({ app, id, originalName, buffer }) {
  try {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return { ok: false, error: '檔案內容為空' };
    }
    const { filePath, storedName } = resolveUploadPath(app, id, originalName);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buffer);
    return {
      ok: true,
      url: `/uploads/${app}/${storedName}`,
      storedName,
      originalName: originalName || storedName,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 刪除 `public/uploads/{app}/{storedName}` 底下的一個檔案（若存在） */
export function removeUploadedFile({ app, storedName }) {
  try {
    if (!isSafeSegment(app)) return { ok: false, error: `不合法的 app 名稱：${JSON.stringify(app)}` };
    const filePath = path.resolve(UPLOADS_ROOT, app, storedName);
    const appDirWithSep = path.resolve(UPLOADS_ROOT, app) + path.sep;
    if (!filePath.startsWith(appDirWithSep)) {
      return { ok: false, error: '不合法的路徑' };
    }
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
