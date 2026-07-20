/**
 * 最小可用的 AWS SigV4 Presigned URL 產生器（純 Node `crypto`，不依賴
 * aws-sdk / @aws-sdk/client-s3，因為本次要求「不執行實際的環境安裝」）。
 *
 * 用途：`/__api/s3-presign`（見 write-s3-presign-plugin.mjs）讀取
 * `data/{app}/app.json` 裡的 `storage.s3`（AppStorageS3Config），
 * 幫前端「檔案管理」（/files）頁面產生一個可直接 PUT 上傳的 presigned URL，
 * 模擬真實後端「先跟後端要一個上傳授權，再直接上傳到 S3/R2」的流程：
 *
 *   前端 -> POST /__api/s3-presign { app, filename, contentType }
 *        <- { ok: true, uploadUrl, publicUrl, key, expiresIn }
 *   前端 -> PUT uploadUrl  (body 為檔案本體，Content-Type 需與 presign 時一致)
 *
 * 相容 AWS S3 以及 R2、MinIO 等 S3 相容節點（皆採用相同的 SigV4 簽章演算法，
 * 差異只在 endpoint / region 的網址組合方式）。
 *
 * 安全性：
 * - secretAccessKey 只存在於 server 端（data/{app}/app.json），從不回傳給前端。
 * - presigned URL 有時效性（預設 15 分鐘），逾時後失效。
 * - 這支模組只在 `vite dev` 的 middleware 被呼叫，build 產物不含呼叫路徑。
 */
import crypto from 'node:crypto';

const DEFAULT_EXPIRES_IN = 15 * 60; // 15 分鐘

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function hash(data) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

function toAmzDate(date) {
  // 20260720T083000Z
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function toDateStamp(amzDate) {
  return amzDate.slice(0, 8);
}

/** URI encode 單一路徑片段，符合 SigV4 對 path segment 的編碼規則（保留 `/`）。 */
function encodeRfc3986(str) {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function encodePath(key) {
  return key
    .split('/')
    .map(encodeRfc3986)
    .join('/');
}

/**
 * 依 endpoint 設定判斷要打的實際 host 與是否走 path-style。
 * - 有自訂 endpoint（R2 / MinIO 等 S3 相容節點）：一律 path-style，
 *   host 直接用 endpoint 的 host，path 前面加 `/{bucket}`。
 * - 沒有 endpoint（AWS S3 本身）：採用 virtual-hosted style，
 *   host 為 `{bucket}.s3.{region}.amazonaws.com`。
 */
function resolveHost({ endpoint, bucket, region }) {
  if (endpoint) {
    const url = new URL(endpoint);
    return {
      host: url.host,
      protocol: url.protocol.replace(':', ''),
      pathPrefix: `/${bucket}`,
      virtualHosted: false,
    };
  }
  const normalizedRegion = region || 'us-east-1';
  const host =
    normalizedRegion === 'us-east-1'
      ? `${bucket}.s3.amazonaws.com`
      : `${bucket}.s3.${normalizedRegion}.amazonaws.com`;
  return { host, protocol: 'https', pathPrefix: '', virtualHosted: true };
}

/**
 * 產生一個 SigV4 presigned URL（query-string 簽章版本，`X-Amz-Signature=...`），
 * 讓前端可以直接對回傳的網址發出 HTTP PUT 上傳檔案本體，不需帶任何 Authorization header。
 *
 * @param {object} params
 * @param {string} params.accessKeyId
 * @param {string} params.secretAccessKey
 * @param {string} params.region        AWS region（R2 慣例填 'auto'）
 * @param {string} params.bucket
 * @param {string} [params.endpoint]    S3 相容節點的 endpoint（R2 / MinIO 等），AWS S3 可留空
 * @param {string} params.key           物件 key（例如 `2026/07/20/uuid-filename.png`）
 * @param {string} [params.contentType] 上傳時瀏覽器會帶的 Content-Type，需與 presign 時一致
 * @param {number} [params.expiresIn]   逾時秒數，預設 900（15 分鐘）
 * @param {string} [params.method]      HTTP method，預設 'PUT'
 * @returns {{ uploadUrl: string, host: string, method: string }}
 */
export function createPresignedUrl({
  accessKeyId,
  secretAccessKey,
  region,
  bucket,
  endpoint,
  key,
  contentType,
  expiresIn = DEFAULT_EXPIRES_IN,
  method = 'PUT',
}) {
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = toDateStamp(amzDate);
  const normalizedRegion = region || 'auto';

  const { host, protocol, pathPrefix } = resolveHost({ endpoint, bucket, region: normalizedRegion });
  const canonicalUri = `${pathPrefix}/${encodePath(key)}`;

  const credentialScope = `${dateStamp}/${normalizedRegion}/s3/aws4_request`;
  const signedHeaders = 'host';

  const queryParams = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresIn),
    'X-Amz-SignedHeaders': signedHeaders,
  };

  // canonical query string 需依 key 字母排序、value 做 RFC3986 編碼
  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(queryParams[k])}`)
    .join('&');

  const canonicalHeaders = `host:${host}\n`;
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hash(canonicalRequest),
  ].join('\n');

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, normalizedRegion);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  const finalQueryString = `${canonicalQueryString}&X-Amz-Signature=${signature}`;
  const uploadUrl = `${protocol}://${host}${canonicalUri}?${finalQueryString}`;

  return { uploadUrl, host, method };
}

/** 產生一個安全、可讀的物件 key：`{app}/{yyyy}/{mm}/{dd}/{uuid}.{ext}`，一律保留原始副檔名。 */
export function buildObjectKey({ app, filename }) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const safeApp = (app || 'default').replace(/[^a-zA-Z0-9_-]+/g, '_');

  const base = typeof filename === 'string' && filename.trim() ? filename.trim() : 'file';
  const baseNameOnly = base.replace(/^.*[/\\]/, '');

  // 副檔名獨立抽出、保留原樣（僅清理不合法字元），確保無論原始檔名有多少
  // 特殊字元，最終 key 一定以正確的副檔名結尾（例如 .png、.pdf），
  // 讓 S3 / R2 上的物件、以及前端依副檔名判斷的邏輯都能正常運作。
  const lastDotIdx = baseNameOnly.lastIndexOf('.');
  const hasExt = lastDotIdx > 0 && lastDotIdx < baseNameOnly.length - 1;
  const namePart = hasExt ? baseNameOnly.slice(0, lastDotIdx) : baseNameOnly;
  const extPart = hasExt ? baseNameOnly.slice(lastDotIdx + 1) : '';

  const safeNamePart = namePart.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '') || 'file';
  const safeExtPart = extPart.replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();

  const uuid = crypto.randomUUID();
  const finalName = safeExtPart ? `${uuid}-${safeNamePart}.${safeExtPart}` : `${uuid}-${safeNamePart}`;
  return `${safeApp}/${yyyy}/${mm}/${dd}/${finalName}`;
}

/** 依 domain（app 設定的 storage.domain，例如 CDN 網域）與 key 組出對外可訪問的公開網址 */
export function buildPublicUrl({ domain, endpoint, bucket, region, key }) {
  const encodedKey = encodePath(key);
  if (domain) {
    const trimmed = domain.replace(/\/+$/, '');
    return `${trimmed}/${encodedKey}`;
  }
  const { host, protocol, pathPrefix } = resolveHost({ endpoint, bucket, region });
  return `${protocol}://${host}${pathPrefix}/${encodedKey}`;
}
