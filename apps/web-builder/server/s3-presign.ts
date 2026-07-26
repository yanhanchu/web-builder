// ============================================================
// S3 相容節點的 Presigned URL 產生器（AWS Signature Version 4）
//
// 純前端上傳的做法：前端先跟這個 dev server 要一個「已簽名的
// PUT URL」，之後直接拿這個 URL 對 S3 / MinIO / R2 / B2 等節點
// 發 PUT 請求上傳檔案本體，檔案內容完全不會經過這個 server。
//
// 這裡刻意不依賴 @aws-sdk/client-s3，直接用 Node 內建的
// node:crypto 手刻 SigV4（query-string 簽名 / "presigned URL"
// 那一種，規格見 AWS 文件 "Authenticating Requests: Using Query
// Parameters (AWS Signature Version 4)"），原因：
//   1. 任務要求不安裝任何相依套件、不做建置驗證。
//   2. SigV4 的 query-string 簽名法本身就是給「無 SDK 環境」
//      設計的（瀏覽器 / curl 都能直接發請求），手刻也才幾十行，
//      不需要整包 SDK。
// ============================================================

import crypto from "node:crypto";
import type { S3UploadDest } from "../src/lib/upload-destinations.types";

const DEFAULT_EXPIRES_SECONDS = 60 * 5; // 5 分鐘內要完成上傳

function hmac(key: crypto.BinaryLike, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string): string {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

function toAmzDate(d: Date): { amzDate: string; dateStamp: string } {
  const iso = d.toISOString().replace(/[:-]|\.\d{3}/g, ""); // 20260726T113000Z
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

/** RFC 3986 percent-encoding，AWS 要求 "~" 不能被跳脫，其餘照標準 encodeURIComponent 即可。 */
function rfc3986Encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** S3 物件 key 裡的 "/" 要維持原樣（代表路徑分隔），其餘字元照 RFC 3986 編碼。 */
function encodeS3Key(key: string): string {
  return key.split("/").map(rfc3986Encode).join("/");
}

function resolveHost(dest: S3UploadDest): {
  protocol: string;
  host: string;
  pathPrefix: string;
} {
  if (dest.endpoint) {
    const url = new URL(dest.endpoint);
    const protocol = url.protocol.replace(":", "");
    if (dest.forcePathStyle) {
      return { protocol, host: url.host, pathPrefix: `/${dest.bucket}` };
    }
    // virtual-hosted-style：把 bucket 疊到 endpoint 的 host 前面
    return {
      protocol,
      host: `${dest.bucket}.${url.host}`,
      pathPrefix: "",
    };
  }
  // 沒填 endpoint -> 使用 AWS 官方端點
  const region = dest.region || "us-east-1";
  const host =
    region === "us-east-1"
      ? `${dest.bucket}.s3.amazonaws.com`
      : `${dest.bucket}.s3.${region}.amazonaws.com`;
  return { protocol: "https", host, pathPrefix: "" };
}

export interface PresignPutParams {
  dest: S3UploadDest;
  /** 物件 key（例如 "uploads/2026/07/xxxx.png"），需已含副檔名。 */
  key: string;
  /** 選填：預先鎖定 Content-Type，之後瀏覽器 PUT 時必須帶完全相同的 header。 */
  contentType?: string;
  expiresSeconds?: number;
}

export interface PresignPutResult {
  /** 前端直接對這個 URL 發 PUT（body 是檔案本體）即可完成上傳。 */
  uploadUrl: string;
  /** 若有指定 contentType，前端發 PUT 時必須帶上這個 header，簽名才會驗證通過。 */
  requiredHeaders: Record<string, string>;
  method: "PUT";
  expiresAt: string;
}

/**
 * 手刻 SigV4 query-string 簽名，PUT / GET 共用同一套流程，
 * 差別只在 HTTP method（其餘 canonical request 組成規則完全相同）。
 */
function presignQueryString(params: {
  dest: S3UploadDest;
  method: "PUT" | "GET";
  key: string;
  expiresSeconds: number;
}): { url: string; expiresAt: string } {
  const { dest, method, key, expiresSeconds } = params;
  const region = dest.region || "auto";
  const now = new Date();
  const { amzDate, dateStamp } = toAmzDate(now);
  const { protocol, host, pathPrefix } = resolveHost(dest);

  const canonicalUri = `${pathPrefix}/${encodeS3Key(key)}`;
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const credential = `${dest.accessKeyId}/${credentialScope}`;

  const queryParams: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": "host",
  };

  const sortedKeys = Object.keys(queryParams).sort();
  const canonicalQuery = sortedKeys
    .map((k) => `${rfc3986Encode(k)}=${rfc3986Encode(queryParams[k])}`)
    .join("&");

  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = "host";
  // presigned URL 事先不知道內容（PUT 是瀏覽器待上傳的檔案；GET 則本來就沒有
  // request body），payload hash 固定用 AWS 官方支援的 UNSIGNED-PAYLOAD。
  const payloadHash = "UNSIGNED-PAYLOAD";

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${dest.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = crypto
    .createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  const finalQuery = `${canonicalQuery}&X-Amz-Signature=${signature}`;

  return {
    url: `${protocol}://${host}${canonicalUri}?${finalQuery}`,
    expiresAt: new Date(now.getTime() + expiresSeconds * 1000).toISOString(),
  };
}

/**
 * 產生 S3 PutObject 的 presigned URL（query-string 簽名版本）。
 * 相容 AWS S3、MinIO、Cloudflare R2、Backblaze B2 等任何走 SigV4 的節點。
 */
export function presignPutObject(params: PresignPutParams): PresignPutResult {
  const { dest, key, contentType, expiresSeconds = DEFAULT_EXPIRES_SECONDS } =
    params;
  const { url, expiresAt } = presignQueryString({
    dest,
    method: "PUT",
    key,
    expiresSeconds,
  });

  const requiredHeaders: Record<string, string> = {};
  if (contentType) requiredHeaders["Content-Type"] = contentType;

  return {
    uploadUrl: url,
    requiredHeaders,
    method: "PUT",
    expiresAt,
  };
}

export interface PresignGetParams {
  dest: S3UploadDest;
  key: string;
  expiresSeconds?: number;
}

export interface PresignGetResult {
  downloadUrl: string;
  method: "GET";
  expiresAt: string;
}

/**
 * 產生 S3 GetObject 的 presigned URL。
 *
 * 用途：「跨目的地同步」時，若檔案的來源就存放在某個 S3 相容節點（而非本機
 * 磁碟），這個 dev server 需要先把檔案內容讀出來，才能再寫到另一個同步
 * 目的地。私有 bucket 沒有公開讀取權限，所以用這個簽名 URL 讓 server 端
 * 用 fetch() 讀取物件內容，而不需要額外的憑證交換流程。
 */
export function presignGetObject(params: PresignGetParams): PresignGetResult {
  const { dest, key, expiresSeconds = DEFAULT_EXPIRES_SECONDS } = params;
  const { url, expiresAt } = presignQueryString({
    dest,
    method: "GET",
    key,
    expiresSeconds,
  });
  return { downloadUrl: url, method: "GET", expiresAt };
}

/** 簽好的 URL 上傳成功後，物件的「公開網址」（若有設定 publicBaseUrl 就用它，否則退回節點本身網址）。 */
export function resolvePublicUrl(dest: S3UploadDest, key: string): string {
  if (dest.publicBaseUrl) {
    return `${dest.publicBaseUrl.replace(/\/+$/, "")}/${encodeS3Key(key)}`;
  }
  const { protocol, host, pathPrefix } = resolveHost(dest);
  return `${protocol}://${host}${pathPrefix}/${encodeS3Key(key)}`;
}

/**
 * 反向解析：給一個 URL，判斷它是否指向這個 S3 目的地（不論當初是用
 * publicBaseUrl 或節點本身網址產生的），是的話回傳解碼後的物件 key。
 *
 * 用途：「跨目的地同步」時，前端只知道來源檔案目前的 url，不知道它對應
 * 哪個 key；這個函式讓 server 端能反推回 key，才能對來源目的地產生
 * presigned GET URL 讀取內容。
 */
export function extractKeyIfMatches(
  dest: S3UploadDest,
  url: string,
): string | null {
  const tryStrip = (prefix: string): string | null => {
    if (!url.startsWith(prefix)) return null;
    const rest = url.slice(prefix.length).replace(/^\/+/, "");
    if (!rest) return null;
    try {
      return rest
        .split("/")
        .map((seg) => decodeURIComponent(seg))
        .join("/");
    } catch {
      return null;
    }
  };

  if (dest.publicBaseUrl) {
    const viaPublicBase = tryStrip(`${dest.publicBaseUrl.replace(/\/+$/, "")}/`);
    if (viaPublicBase) return viaPublicBase;
  }

  const { protocol, host, pathPrefix } = resolveHost(dest);
  const viaHost = tryStrip(`${protocol}://${host}${pathPrefix}/`);
  if (viaHost) return viaHost;

  return null;
}