// 呼叫 `/__api/s3-presign` 的 fetch 邏輯（dev only），並用取得的 presigned URL
// 直接把檔案本體 PUT 上傳到 S3 / R2 等 S3 相容節點。
//
// 跟 files-disk-api.ts（本機檔案系統上傳）是同一套「檔案管理」（/files）頁面下
// 的另一種上傳供應商選項：app 設定（AppSettings.storage.provider）為 's3' 時，
// 走這裡的流程；為 'local' 時走 files-disk-api.ts 的 uploadFileToDisk。
//
// 流程（「vite dev server 模擬後端」）：
//   1. 前端呼叫 /__api/s3-presign { app, filename, contentType }
//   2. dev server 讀 data/{app}/app.json 的 storage.s3 連線設定，
//      用 SigV4 簽出一組限時（可於 App 設定調整，預設 15 分鐘）的
//      presigned PUT URL（見 scripts/write-s3-presign.mjs，純 Node crypto
//      實作，未使用 aws-sdk）。物件 key 一律保留原始檔案的副檔名
//      （見 scripts/s3-presign.mjs 的 buildObjectKey），例如
//      `my-app/2026/07/20/uuid-name.png`。
//   3. dev server 回傳 { uploadUrl, publicUrl, key }，secretAccessKey 全程
//      不會出現在回傳內容裡
//   4. 前端直接對 uploadUrl 發出 PUT（body 為檔案本體），檔案本體完全不
//      經過這台 dev server 中轉，直接落地在 S3 / R2 上
//
// 對應的 server 端 middleware 只在 `vite dev` 掛載（見
// scripts/write-s3-presign-plugin.mjs），`vite build` 產物不含這個端點。

// 刪除流程：
//   1. 前端呼叫 /__api/s3-delete-presign { app, key }（key 為上傳當下拿到、
//      存在 FileEntry.locations.s3.key 的物件 key）
//   2. dev server 用同一套 SigV4 簽出一組 presigned DELETE URL
//   3. 前端直接對該 URL 發出 DELETE，物件從 S3 / R2 上移除

const PRESIGN_API_PATH = '/__api/s3-presign';
const DELETE_PRESIGN_API_PATH = '/__api/s3-delete-presign';

export interface S3PresignResult {
  ok: true;
  uploadUrl: string;
  publicUrl: string;
  key: string;
  method: string;
  expiresIn: number;
}

export interface S3UploadError {
  ok: false;
  error: string;
}

/** 呼叫 dev server，取得一組可直接上傳的 presigned URL 與物件 key。 */
export async function requestS3Presign(
  app: string,
  filename: string,
  contentType: string
): Promise<S3PresignResult | S3UploadError> {
  try {
    const res = await fetch(PRESIGN_API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app, filename, contentType }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.ok !== true) {
      return { ok: false, error: body?.error ?? `取得上傳授權失敗（HTTP ${res.status}）` };
    }
    return body as S3PresignResult;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '取得上傳授權失敗：未知錯誤' };
  }
}

/** 對 presigned URL 直接 PUT 上傳檔案本體（不經過本機 dev server 中轉）。 */
async function putFileToPresignedUrl(
  uploadUrl: string,
  file: File | Blob,
  contentType: string
): Promise<{ ok: true } | S3UploadError> {
  try {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file,
    });
    if (!res.ok) {
      return { ok: false, error: `上傳至 S3 失敗（HTTP ${res.status}）` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '上傳至 S3 失敗：未知錯誤' };
  }
}

export interface UploadFileToS3Result {
  ok: true;
  url: string; // publicUrl，可直接當 <img src> 或下載連結使用
  key: string;
}

/**
 * 完整的「取得 presigned URL -> 直接上傳」流程，供 file-manager.tsx 呼叫。
 * 對外行為與 files-disk-api.ts 的 `uploadFileToDisk` 對齊
 * （回傳 `{ ok: true, url, ... } | { ok: false, error }`），
 * 方便 UI 端用同一套錯誤處理邏輯切換兩種 provider。
 */
export async function uploadFileToS3(
  app: string,
  file: File
): Promise<UploadFileToS3Result | S3UploadError> {
  const contentType = file.type || 'application/octet-stream';
  const presign = await requestS3Presign(app, file.name, contentType);
  if (!presign.ok) return presign;

  const putResult = await putFileToPresignedUrl(presign.uploadUrl, file, contentType);
  if (!putResult.ok) return putResult;

  return { ok: true, url: presign.publicUrl, key: presign.key };
}

/** 判斷目前是否可能存在 dev-only 的 presign API（粗略依 dev/prod 判斷，實際仍以 fetch 結果為準）。 */
export function isS3UploadLikelyAvailable(): boolean {
  return import.meta.env.DEV;
}

export interface S3DeletePresignResult {
  ok: true;
  deleteUrl: string;
  method: string;
  expiresIn: number;
}

/** 呼叫 dev server，取得一組可直接對既有物件 key 發出 DELETE 的 presigned URL。 */
async function requestS3DeletePresign(
  app: string,
  key: string
): Promise<S3DeletePresignResult | S3UploadError> {
  try {
    const res = await fetch(DELETE_PRESIGN_API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app, key }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.ok !== true) {
      return { ok: false, error: body?.error ?? `取得刪除授權失敗（HTTP ${res.status}）` };
    }
    return body as S3DeletePresignResult;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '取得刪除授權失敗：未知錯誤' };
  }
}

/**
 * 完整的「取得 presigned DELETE URL -> 直接刪除」流程，供刪除檔案時呼叫，
 * 清掉已同步到 S3 / R2 的本體，避免留下孤兒物件。`key` 對應
 * FileEntry.locations.s3.key（上傳當下 uploadFileToS3 回傳的 key）。
 */
export async function deleteFileFromS3(app: string, key: string): Promise<{ ok: true } | S3UploadError> {
  const presign = await requestS3DeletePresign(app, key);
  if (!presign.ok) return presign;

  try {
    const res = await fetch(presign.deleteUrl, { method: 'DELETE' });
    // S3 對已存在物件的 DELETE 通常回 204；對不存在的 key 多數實作也回 204
    // （冪等刪除），因此只要 HTTP 層級成功（2xx）就視為成功。
    if (!res.ok) {
      return { ok: false, error: `刪除 S3 物件失敗（HTTP ${res.status}）` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '刪除 S3 物件失敗：未知錯誤' };
  }
}
