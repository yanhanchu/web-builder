// 呼叫 `/__api/upload-file` 的 fetch 邏輯（dev only）。
//
// 跟 routes-disk-api.ts / pages-disk-api.ts 同一套「fetch 包一層、回傳
// { ok, ... } 或 { ok: false, error } 」慣例，只是這裡上傳的是二進位檔案
// 內容（multipart/form-data），不是 JSON。
//
// 對應的 server 端 middleware 只在 `vite dev` 掛載（見
// scripts/write-files-plugin.mjs），`vite build` 產物不含這個端點，
// 使用情境跟 pages/i18n/routes 的「寫入檔案系統」按鈕一致：
// 使用者按下「上傳到本機」才會呼叫，不是每次選檔案就自動觸發。
//
// 上傳成功後，檔案會被實際寫入 `public/uploads/{app}/{storedName}`，
// 並回傳可直接使用的靜態路徑（url），前端可以把 FileEntry.storageKind
// 從 'opfs' 換成 'disk'、url 換成這裡回傳的路徑。

const API_PATH = '/__api/upload-file';

export interface UploadFileResult {
  ok: true;
  url: string;
  storedName: string;
  originalName: string;
}

export interface UploadFileError {
  ok: false;
  error: string;
}

/**
 * 把單一檔案上傳到本機 dev server，寫入 `public/uploads/{app}/`。
 * `id` 建議帶入 FileEntry.id，server 端會以此為基礎組出實際儲存檔名
 * （保留副檔名，避免瀏覽器/系統無法辨識檔案類型）。
 */
export async function uploadFileToDisk(
  app: string,
  id: string,
  file: File
): Promise<UploadFileResult | UploadFileError> {
  try {
    const form = new FormData();
    form.append('app', app);
    form.append('id', id);
    form.append('file', file, file.name);

    const res = await fetch(API_PATH, {
      method: 'POST',
      body: form,
    });

    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.ok !== true) {
      return { ok: false, error: body?.error ?? `上傳失敗（HTTP ${res.status}）` };
    }
    return { ok: true, url: body.url, storedName: body.storedName, originalName: body.originalName };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '上傳失敗：未知錯誤' };
  }
}

/** 判斷目前是否可能存在 dev-only 上傳 API（純粹依 dev/prod 模式粗略判斷，非強保證，實際仍以 fetch 結果為準）。 */
export function isDiskUploadLikelyAvailable(): boolean {
  return import.meta.env.DEV;
}

/**
 * 刪除已同步到本機 `public/uploads/{app}/` 的檔案本體（dev only）。
 * `storedName` 對應 uploadFileToDisk 回傳的 storedName（見 FileEntry.locations.disk）。
 * 對應 server 端 `DELETE /__api/upload-file`（見 scripts/write-files-plugin.mjs、
 * scripts/write-files.mjs 的 removeUploadedFile）。
 */
export async function deleteFileFromDisk(
  app: string,
  storedName: string
): Promise<{ ok: true } | UploadFileError> {
  try {
    const res = await fetch(API_PATH, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app, storedName }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.ok !== true) {
      return { ok: false, error: body?.error ?? `刪除失敗（HTTP ${res.status}）` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '刪除失敗：未知錯誤' };
  }
}
