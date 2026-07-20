/**
 * 讀取「App 設定」（AppSettings.storage，型別定義見各自 app 專案的
 * types），驗證後呼叫 presign.mjs 產生 presigned URL，回傳給前端
 * 「檔案管理」頁面：
 *   - 上傳：presigned PUT URL + 新產生的物件 key（createS3UploadPresign）
 *   - 刪除：presigned DELETE URL（沿用既有的物件 key，createS3DeletePresign）
 * 模擬「前端跟後端要一個授權（token），再直接對 S3 相容節點操作」的常見架構。
 *
 * 這個套件（@workspace/server）刻意不依賴任何特定 app 的資料存取方式
 * （例如 data/{app}/app.json 要怎麼讀）——呼叫端（例如
 * apps/web-builder/scripts/write-s3-presign-plugin.mjs）負責自行讀出
 * app 的 storage 設定物件，再傳進這裡的函式；這樣 @workspace/server
 * 才能單獨被其他 app 重用，不綁定單一 app 的檔案配置。
 *
 * 僅供 server 端（Node）呼叫，`secretAccessKey` 不會外洩到前端。
 */
import { createPresignedUrl, buildObjectKey, buildPublicUrl } from './presign.mjs';

/**
 * 驗證呼叫端傳入的 app storage 設定，回傳 { storage, s3, expiresIn } 供
 * createS3UploadPresign / createS3DeletePresign 共用；驗證失敗回傳
 * { error } 形式，呼叫端直接把 error 包成 { ok: false, error } 回傳。
 *
 * @param {object} storage  對應 AppSettings.storage（含 providers / s3 / domain）
 */
function resolveS3Config(storage) {
  const providers = Array.isArray(storage?.providers) ? storage.providers : [];
  if (!storage || !providers.includes('s3')) {
    return { error: `尚未啟用 S3 相容儲存（storage.providers 需包含 's3'）` };
  }

  const s3 = storage.s3 ?? {};
  const { accessKeyId, secretAccessKey, endpoint, region, bucket, expiresIn: configuredExpiresIn } = s3;

  if (!accessKeyId || !secretAccessKey || !bucket) {
    return { error: '請先在「App 設定」補齊 S3 連線設定（accessKeyId / secretAccessKey / bucket）' };
  }

  const expiresIn =
    typeof configuredExpiresIn === 'number' && configuredExpiresIn > 0 ? configuredExpiresIn : undefined;

  return { storage, s3: { accessKeyId, secretAccessKey, endpoint, region, bucket }, expiresIn };
}

/**
 * @param {object} params
 * @param {string} params.app           目前選定的 app（僅用來組出物件 key 的命名空間，不用來讀設定檔）
 * @param {object} params.storage       呼叫端已讀出的 AppSettings.storage 設定物件
 * @param {string} params.filename      原始檔名（用來組出物件 key，並保留副檔名）
 * @param {string} [params.contentType] 檔案的 MIME type
 * @returns {{ ok: true, uploadUrl: string, publicUrl: string, key: string, expiresIn: number, method: string }
 *          | { ok: false, error: string }}
 */
export function createS3UploadPresign({ app, storage, filename, contentType }) {
  if (typeof filename !== 'string' || !filename.trim()) {
    return { ok: false, error: '缺少必要欄位：filename' };
  }

  const resolved = resolveS3Config(storage);
  if (resolved.error) return { ok: false, error: resolved.error };
  const { s3, expiresIn } = resolved;

  try {
    const key = buildObjectKey({ app, filename });
    const { uploadUrl, method } = createPresignedUrl({
      ...s3,
      key,
      contentType,
      method: 'PUT',
      ...(expiresIn ? { expiresIn } : {}),
    });
    const publicUrl = buildPublicUrl({ domain: storage.domain, endpoint: s3.endpoint, bucket: s3.bucket, region: s3.region, key });

    return {
      ok: true,
      uploadUrl,
      publicUrl,
      key,
      method,
      expiresIn: expiresIn ?? 15 * 60,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 產生一個 presigned DELETE URL，讓前端可以直接對既有的物件 key 發出
 * HTTP DELETE，移除 S3 / R2 上的檔案本體（用於「刪除檔案」時一併清掉
 * 已同步到 S3 的本體，避免留下孤兒物件）。
 *
 * @param {object} params
 * @param {object} params.storage  呼叫端已讀出的 AppSettings.storage 設定物件
 * @param {string} params.key      既有的物件 key（來自上傳當下 createS3UploadPresign 回傳的 key）
 * @returns {{ ok: true, deleteUrl: string, expiresIn: number, method: string } | { ok: false, error: string }}
 */
export function createS3DeletePresign({ storage, key }) {
  if (typeof key !== 'string' || !key.trim()) {
    return { ok: false, error: '缺少必要欄位：key' };
  }

  const resolved = resolveS3Config(storage);
  if (resolved.error) return { ok: false, error: resolved.error };
  const { s3, expiresIn } = resolved;

  try {
    const { uploadUrl, method } = createPresignedUrl({
      ...s3,
      key,
      method: 'DELETE',
      ...(expiresIn ? { expiresIn } : {}),
    });

    return {
      ok: true,
      deleteUrl: uploadUrl,
      method,
      expiresIn: expiresIn ?? 15 * 60,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
